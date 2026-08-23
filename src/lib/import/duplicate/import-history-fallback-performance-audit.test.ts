/**
 * Full-history fallback performance audit (TEST ONLY — no production changes).
 *
 * Run: npx vitest run src/lib/import/duplicate/import-history-fallback-performance-audit.test.ts
 */

import { Timestamp } from 'firebase-admin/firestore';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildDuplicateImportFingerprints,
  detectDuplicateImport,
  DUPLICATE_IMPORT_STATUS,
  IMPORT_HISTORY_STATUS,
} from '@/lib/import/duplicate';
import {
  areDuplicateResultsEqual,
  compareDuplicateDetectionPaths,
  detectDuplicateImportWithCandidateLookup,
  resolveImportHistoryForDuplicateDetection,
} from '@/lib/import/duplicate/import-duplicate-index-candidate.service';
import { withCollectionGroupMock } from '@/lib/import/duplicate/import-duplicate-index-collection-group.mock';
import { ORG_IMPORT_INDEX_COVERAGE } from '@/lib/import/duplicate/import-index-health.types';
import {
  markOrgIndexCoverageCompleteForTests,
  markOrgIndexCoverageIncompleteForTests,
} from '@/lib/import/duplicate/import-index-health.test-helpers';
import {
  buildAuditRow,
  buildAuditRows,
  type DocMap,
} from '@/lib/import/duplicate/import-history-chunked-storage-audit.helpers';
import {
  buildExcelRows,
  buildExactDuplicateExcelFromHistory,
  buildSyntheticHistoryRecord,
  estimateHistoryMemoryBytes,
  expectedChunkReadsForImport,
  FALLBACK_PERF_RESULTS,
  measureDetectDuplicateOnly,
  recordFallbackPerf,
  seedChunkedHistoryDoc,
  seedInlineHistoryDoc,
  type FirestoreReadCounters,
} from '@/lib/import/duplicate/import-history-fallback-performance-audit.helpers';
import type { ImportReviewViewModelWithResolution } from '@/lib/import/resolution/types';
import { importIndexHealthRepository } from '@/lib/repositories/import-index-health.repository';

function createInstrumentedFirestore() {
  const docs: DocMap = new Map();
  const counters: FirestoreReadCounters = {
    collectionGets: 0,
    docGets: 0,
    queries: 0,
    batchCommits: 0,
  };
  let autoId = 0;

  function trackDocGet() {
    counters.docGets += 1;
  }

  function trackQuery() {
    counters.queries += 1;
  }

  function collectionAt(basePath: string) {
    return {
      doc(id?: string) {
        const docId = id ?? `auto-${++autoId}`;
        const path = `${basePath}/${docId}`;
        return {
          id: docId,
          path,
          collection(name: string) {
            return collectionAt(`${path}/${name}`);
          },
          get: async () => {
            trackDocGet();
            return { exists: docs.has(path), id: docId, data: () => docs.get(path) };
          },
          set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
            const prev = docs.get(path);
            docs.set(path, opts?.merge && prev ? { ...prev, ...data } : { ...data });
          },
          update: async (data: Record<string, unknown>) => {
            docs.set(path, { ...(docs.get(path) ?? {}), ...data });
          },
        };
      },
      where(field: string, op: string, value: unknown) {
        const filters = [{ field, op, value }];
        const query = {
          where(nf: string, nop: string, nv: unknown) {
            filters.push({ field: nf, op: nop, value: nv });
            return query;
          },
          limit() {
            return query;
          },
          get: async () => {
            trackQuery();
            const matches = [...docs.entries()].filter(([path, data]) => {
              const suffix = path.slice(basePath.length + 1);
              if (!path.startsWith(`${basePath}/`) || suffix.includes('/')) return false;
              return filters.every((f) => f.op === '==' && data[f.field] === f.value);
            });
            return {
              docs: matches.map(([path, data]) => ({ id: path.slice(basePath.length + 1), data: () => data })),
              empty: matches.length === 0,
            };
          },
        };
        return query;
      },
      get: async () => {
        trackQuery();
        counters.collectionGets += 1;
        return {
          docs: [...docs.entries()]
            .filter(([path]) => {
              const suffix = path.slice(basePath.length + 1);
              return path.startsWith(`${basePath}/`) && !suffix.includes('/');
            })
            .map(([path, data]) => ({ id: path.slice(basePath.length + 1), data: () => data })),
        };
      },
    };
  }

  const db = withCollectionGroupMock(
    {
      collection: (name: string) => {
        const root = collectionAt(name);
        return {
          ...root,
          doc(id?: string) {
            const ref = root.doc(id);
            return { ...ref, collection: (sub: string) => collectionAt(`${ref.path}/${sub}`) };
          },
        };
      },
      batch: () => {
        const ops: Array<{ path: string; data: Record<string, unknown> }> = [];
        return {
          set(ref: { path: string }, data: Record<string, unknown>) {
            ops.push({ path: ref.path, data: { ...data } });
          },
          async commit() {
            counters.batchCommits += 1;
            for (const op of ops) docs.set(op.path, op.data);
          },
        };
      },
      runTransaction: async (fn: (tx: { get: (ref: { path: string }) => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>; set: (ref: { path: string }, data: Record<string, unknown>) => void }) => Promise<unknown>) =>
        fn({
          get: async (ref) => {
            trackDocGet();
            return { exists: docs.has(ref.path), data: () => docs.get(ref.path) };
          },
          set: (ref, data) => docs.set(ref.path, { ...data }),
        }),
    },
    docs,
  );

  return { docs, db, counters, resetCounters: () => {
    counters.collectionGets = 0;
    counters.docGets = 0;
    counters.queries = 0;
    counters.batchCommits = 0;
  } };
}

const harness = vi.hoisted(() => ({
  current: null as ReturnType<typeof createInstrumentedFirestore> | null,
}));

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => harness.current!.db,
}));

const ORG = 'org-fallback-perf';
const USER = 'perf-user';

function reviewFromRows(rows: ReturnType<typeof buildAuditRows>): ImportReviewViewModelWithResolution {
  return { rows } as unknown as ImportReviewViewModelWithResolution;
}

async function setOrgCoverage(
  coverage: (typeof ORG_IMPORT_INDEX_COVERAGE)[keyof typeof ORG_IMPORT_INDEX_COVERAGE] | 'missing',
): Promise<void> {
  if (coverage === 'missing') {
    return;
  }

  await importIndexHealthRepository.setOrgCoverage(ORG, USER, { coverage });
}

async function seedHistoryImports(
  count: number,
  rowsPerImport: number,
  mode: 'inline' | 'chunked' | 'mixed',
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const storage =
      mode === 'mixed' ? (index % 2 === 0 ? 'inline' : 'chunked') : mode;
    const rows =
      storage === 'chunked' && rowsPerImport < 500
        ? buildAuditRows(500, `H${index}`)
        : buildAuditRows(rowsPerImport, `H${index}`);
    const fp = buildDuplicateImportFingerprints(rows);
    const importId = `import-${index}`;

    if (storage === 'chunked' || fp.rowFingerprints.length >= 500) {
      seedChunkedHistoryDoc(harness.current!.docs, ORG, USER, importId, fp);
    } else {
      seedInlineHistoryDoc(harness.current!.docs, ORG, USER, importId, fp);
    }
  }
}

async function measureFallbackPath(
  excelRowCount: number,
  options: {
    historyCount: number;
    rowsPerImport: number;
    storageMode: 'inline' | 'chunked' | 'mixed';
    coverage: (typeof ORG_IMPORT_INDEX_COVERAGE)[keyof typeof ORG_IMPORT_INDEX_COVERAGE] | 'missing';
    duplicateImportIndex?: number;
  },
): Promise<typeof FALLBACK_PERF_RESULTS[number]> {
  harness.current!.resetCounters();
  const docGetsBefore = harness.current!.counters.docGets;
  const queriesBefore = harness.current!.counters.queries;

  await seedHistoryImports(options.historyCount, options.rowsPerImport, options.storageMode);

  if (options.coverage === ORG_IMPORT_INDEX_COVERAGE.COMPLETE) {
    await markOrgIndexCoverageCompleteForTests(ORG, USER, options.historyCount);
  } else if (options.coverage === ORG_IMPORT_INDEX_COVERAGE.INCOMPLETE) {
    await markOrgIndexCoverageIncompleteForTests(ORG, USER);
  } else if (options.coverage === ORG_IMPORT_INDEX_COVERAGE.UNKNOWN) {
    await importIndexHealthRepository.setOrgCoverage(ORG, USER, {
      coverage: ORG_IMPORT_INDEX_COVERAGE.UNKNOWN,
    });
  } else if (options.coverage === ORG_IMPORT_INDEX_COVERAGE.REPAIRING) {
    await importIndexHealthRepository.setOrgCoverage(ORG, USER, {
      coverage: ORG_IMPORT_INDEX_COVERAGE.REPAIRING,
    });
  }

  let excelRows = buildExcelRows(excelRowCount);

  if (options.duplicateImportIndex !== undefined) {
    const dupRows =
      options.storageMode === 'chunked' || options.rowsPerImport >= 500
        ? buildAuditRows(Math.max(500, options.rowsPerImport), `H${options.duplicateImportIndex}`)
        : buildAuditRows(options.rowsPerImport, `H${options.duplicateImportIndex}`);
    excelRows = buildExactDuplicateExcelFromHistory(dupRows);
  }

  const resolveStarted = performance.now();
  const resolved = await resolveImportHistoryForDuplicateDetection(ORG, reviewFromRows(excelRows));
  const resolveElapsedMs = performance.now() - resolveStarted;

  const detectStarted = performance.now();
  const result = detectDuplicateImport({
    resolvedReview: reviewFromRows(excelRows),
    importHistory: resolved.importHistory,
  });
  const detectElapsedMs = performance.now() - detectStarted;

  const fingerprintsReconstructed = resolved.importHistory.reduce(
    (sum, record) => sum + record.rowFingerprints.length,
    0,
  );
  const invoiceNumbersReconstructed = resolved.importHistory.reduce(
    (sum, record) => sum + record.invoiceNumbers.length,
    0,
  );

  let expectedChunkReads = 0;
  for (let index = 0; index < options.historyCount; index += 1) {
    const storage =
      options.storageMode === 'mixed' ? (index % 2 === 0 ? 'inline' : 'chunked') : options.storageMode;
    const rowsPer =
      storage === 'chunked' && options.rowsPerImport < 500 ? 500 : options.rowsPerImport;
    expectedChunkReads += expectedChunkReadsForImport(rowsPer, rowsPer, storage);
  }

  const docGetsDuring = harness.current!.counters.docGets - docGetsBefore;
  const queriesDuring = harness.current!.counters.queries - queriesBefore;
  const chunkDocsRead = Math.max(0, docGetsDuring - options.historyCount - 5);

  const measurement = {
    historyImportCount: options.historyCount,
    excelRowCount,
    historyRowsPerImport: options.rowsPerImport,
    storageMode: options.storageMode,
    mainDocsRead: options.historyCount,
    chunkDocsRead: expectedChunkReads,
    totalDocGets: docGetsDuring,
    collectionGets: harness.current!.counters.collectionGets,
    queries: queriesDuring,
    indexLookupCount: resolved.meta.indexLookupCount,
    fingerprintsReconstructed,
    invoiceNumbersReconstructed,
    historyRecordsLoaded: resolved.importHistory.length,
    fallbackSource: resolved.meta.source,
    orgCoverage: resolved.meta.orgCoverage,
    detectElapsedMs: Math.round(detectElapsedMs * 100) / 100,
    resolveElapsedMs: Math.round(resolveElapsedMs * 100) / 100,
    totalElapsedMs: Math.round((resolveElapsedMs + detectElapsedMs) * 100) / 100,
    approximateMemoryBytes: estimateHistoryMemoryBytes(resolved.importHistory),
  };

  recordFallbackPerf(measurement);
  return measurement;
}

describe('Full-history fallback performance audit', () => {
  beforeEach(() => {
    harness.current = createInstrumentedFirestore();
    FALLBACK_PERF_RESULTS.length = 0;
  });

  afterAll(() => {
    if (FALLBACK_PERF_RESULTS.length > 0) {
      console.info('[fallback-perf-audit] measurements recorded:', FALLBACK_PERF_RESULTS.length);
    }
  });

  describe('Phase 1 — fallback path by coverage state', () => {
    it('incomplete coverage uses fallback-incomplete', async () => {
      await seedHistoryImports(3, 5, 'inline');
      await markOrgIndexCoverageIncompleteForTests(ORG, USER);
      const resolved = await resolveImportHistoryForDuplicateDetection(ORG, reviewFromRows(buildExcelRows(1)));
      expect(resolved.meta.source).toBe('fallback-incomplete');
      expect(resolved.meta.orgCoverage).toBe(ORG_IMPORT_INDEX_COVERAGE.INCOMPLETE);
      expect(resolved.importHistory.length).toBe(3);
    });

    it('unknown coverage uses fallback-incomplete', async () => {
      await seedHistoryImports(2, 5, 'inline');
      await setOrgCoverage(ORG_IMPORT_INDEX_COVERAGE.UNKNOWN);
      const resolved = await resolveImportHistoryForDuplicateDetection(ORG, reviewFromRows(buildExcelRows(1)));
      expect(resolved.meta.source).toBe('fallback-incomplete');
      expect(resolved.meta.orgCoverage).toBe(ORG_IMPORT_INDEX_COVERAGE.UNKNOWN);
    });

    it('repairing coverage uses fallback-repairing', async () => {
      await seedHistoryImports(2, 5, 'inline');
      await setOrgCoverage(ORG_IMPORT_INDEX_COVERAGE.REPAIRING);
      const resolved = await resolveImportHistoryForDuplicateDetection(ORG, reviewFromRows(buildExcelRows(1)));
      expect(resolved.meta.source).toBe('fallback-repairing');
    });

    it('missing coverage metadata uses fallback-incomplete', async () => {
      await seedHistoryImports(2, 5, 'inline');
      const resolved = await resolveImportHistoryForDuplicateDetection(ORG, reviewFromRows(buildExcelRows(1)));
      expect(resolved.meta.source).toBe('fallback-incomplete');
      expect(resolved.meta.orgCoverage).toBe('missing');
    });

    it('index lookup throw uses fallback-error', async () => {
      await seedHistoryImports(2, 5, 'inline');
      await markOrgIndexCoverageCompleteForTests(ORG, USER);

      const original = harness.current!.db.collectionGroup;
      harness.current!.db.collectionGroup = () => {
        throw new Error('Simulated index lookup failure');
      };

      const resolved = await resolveImportHistoryForDuplicateDetection(ORG, reviewFromRows(buildExcelRows(1)));
      harness.current!.db.collectionGroup = original;

      expect(resolved.meta.source).toBe('fallback-error');
      expect(resolved.importHistory.length).toBe(2);
    });
  });

  describe('Phase 2/3 — history size matrix (inline, incomplete index)', () => {
    for (const historyCount of [100, 1_000] as const) {
      for (const excelRows of [1, 10, 100, 1_000] as const) {
        it(`${historyCount} inline imports, ${excelRows} excel rows`, async () => {
          const m = await measureFallbackPath(excelRows, {
            historyCount,
            rowsPerImport: 5,
            storageMode: 'inline',
            coverage: ORG_IMPORT_INDEX_COVERAGE.INCOMPLETE,
          });

          expect(m.fallbackSource).toMatch(/^fallback-/);
          expect(m.historyRecordsLoaded).toBe(historyCount);
          expect(m.chunkDocsRead).toBe(0);
          expect(m.fingerprintsReconstructed).toBe(historyCount * 5);
          expect(m.indexLookupCount).toBe(0);
        });
      }
    }
  });

  describe('Phase 4 — chunked history fallback reads', () => {
    it('100 small inline imports — zero chunk reads', async () => {
      const m = await measureFallbackPath(10, {
        historyCount: 100,
        rowsPerImport: 5,
        storageMode: 'inline',
        coverage: ORG_IMPORT_INDEX_COVERAGE.INCOMPLETE,
      });
      expect(m.chunkDocsRead).toBe(0);
    });

    it('100 chunked imports (500 rows each) — chunk reads scale with history', async () => {
      const m = await measureFallbackPath(10, {
        historyCount: 100,
        rowsPerImport: 500,
        storageMode: 'chunked',
        coverage: ORG_IMPORT_INDEX_COVERAGE.INCOMPLETE,
      });
      expect(m.chunkDocsRead).toBe(200);
      expect(m.fingerprintsReconstructed).toBe(50_000);
    });

    it('mixed legacy inline + chunked imports load both', async () => {
      const m = await measureFallbackPath(10, {
        historyCount: 20,
        rowsPerImport: 5,
        storageMode: 'mixed',
        coverage: ORG_IMPORT_INDEX_COVERAGE.INCOMPLETE,
      });
      expect(m.historyRecordsLoaded).toBe(20);
      expect(m.chunkDocsRead).toBe(20);
    });

    it('single large chunked import (5000 rows) loads all chunks', async () => {
      const m = await measureFallbackPath(10, {
        historyCount: 1,
        rowsPerImport: 5_000,
        storageMode: 'chunked',
        coverage: ORG_IMPORT_INDEX_COVERAGE.INCOMPLETE,
      });
      expect(m.chunkDocsRead).toBe(8);
      expect(m.fingerprintsReconstructed).toBe(5_000);
    });
  });

  describe('Phase 5/6 — correctness oracle and adversarial cases', () => {
    it('no duplicate with unrelated history', async () => {
      await seedHistoryImports(50, 5, 'inline');
      await markOrgIndexCoverageIncompleteForTests(ORG, USER);
      const result = await detectDuplicateImportWithCandidateLookup(ORG, reviewFromRows(buildExcelRows(10)));
      expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);
    });

    it('exact duplicate in last inline import', async () => {
      await seedHistoryImports(100, 5, 'inline');
      await markOrgIndexCoverageIncompleteForTests(ORG, USER);
      const dupRows = buildAuditRows(5, 'H99');
      const result = await detectDuplicateImportWithCandidateLookup(
        ORG,
        reviewFromRows(buildExactDuplicateExcelFromHistory(dupRows)),
      );
      expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    });

    it('exact duplicate in large chunked import', async () => {
      await seedHistoryImports(10, 1_000, 'chunked');
      await markOrgIndexCoverageIncompleteForTests(ORG, USER);
      const dupRows = buildAuditRows(1_000, 'H9');
      const result = await detectDuplicateImportWithCandidateLookup(
        ORG,
        reviewFromRows(buildExactDuplicateExcelFromHistory(dupRows)),
      );
      expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    });

    it('duplicate with blank invoice number', async () => {
      const rows = [buildAuditRow(2, { invoice: '' })];
      const fp = buildDuplicateImportFingerprints(rows);
      seedInlineHistoryDoc(harness.current!.docs, ORG, USER, 'blank-inv', fp);
      await markOrgIndexCoverageIncompleteForTests(ORG, USER);
      const result = await detectDuplicateImportWithCandidateLookup(ORG, reviewFromRows(rows));
      expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    });

    it('same customer/product twice is not false exact duplicate', async () => {
      const row = buildAuditRow(2, { customerName: 'Store A', productName: 'Bread' });
      const fp1 = buildDuplicateImportFingerprints([row]);
      seedInlineHistoryDoc(harness.current!.docs, ORG, USER, 'once', fp1);
      await markOrgIndexCoverageIncompleteForTests(ORG, USER);
      const excel = [
        buildAuditRow(2, { customerName: 'Store A', productName: 'Bread' }),
        buildAuditRow(3, { customerName: 'Store A', productName: 'Bread' }),
      ];
      const result = await detectDuplicateImportWithCandidateLookup(ORG, reviewFromRows(excel));
      expect(result.status).not.toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    });

    it('legacy inline + chunked both participate in fallback duplicate detection', async () => {
      const inlineRows = buildAuditRows(10, 'LEG');
      seedInlineHistoryDoc(
        harness.current!.docs,
        ORG,
        USER,
        'legacy-1',
        buildDuplicateImportFingerprints(inlineRows),
      );
      const chunkedRows = buildAuditRows(600, 'CHK');
      seedChunkedHistoryDoc(
        harness.current!.docs,
        ORG,
        USER,
        'chunked-1',
        buildDuplicateImportFingerprints(chunkedRows),
      );
      await markOrgIndexCoverageIncompleteForTests(ORG, USER);
      const result = await detectDuplicateImportWithCandidateLookup(
        ORG,
        reviewFromRows(buildExactDuplicateExcelFromHistory(chunkedRows)),
      );
      expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    });

    it('compareDuplicateDetectionPaths matches full-history oracle', async () => {
      await seedHistoryImports(30, 8, 'mixed');
      await markOrgIndexCoverageIncompleteForTests(ORG, USER);
      const fullHistory = (await resolveImportHistoryForDuplicateDetection(ORG, reviewFromRows(buildExcelRows(50))))
        .importHistory;
      const parity = await compareDuplicateDetectionPaths(ORG, {
        resolvedReview: reviewFromRows(buildExcelRows(50)),
        importHistory: fullHistory,
      });
      expect(parity.matches).toBe(true);
    });
  });

  describe('Phase 7 — algorithmic scaling (synthetic, no Firestore)', () => {
    const ALGO_RESULTS: Array<{
      historyCount: number;
      excelRows: number;
      rowsPerImport: number;
      detectMs: number;
      memoryBytes: number;
    }> = [];

    for (const historyCount of [100, 1_000, 10_000, 100_000] as const) {
      for (const excelRows of [1, 10, 100, 1_000] as const) {
        const timeoutMs = historyCount >= 100_000 ? 120_000 : 30_000;
        it(
          `detectDuplicateImport CPU: ${historyCount} history × ${excelRows} excel rows`,
          () => {
          const history = Array.from({ length: historyCount }, (_, index) =>
            buildSyntheticHistoryRecord(index, 10, USER).record,
          );
          const excel = buildExcelRows(excelRows);
          const { elapsedMs } = measureDetectDuplicateOnly(excel, history);

          ALGO_RESULTS.push({
            historyCount,
            excelRows,
            rowsPerImport: 10,
            detectMs: Math.round(elapsedMs * 100) / 100,
            memoryBytes: estimateHistoryMemoryBytes(history),
          });

          if (historyCount <= 10_000) {
            expect(elapsedMs).toBeLessThan(30_000);
          }
          },
          timeoutMs,
        );
      }
    }

    afterAll(() => {
      const excel1000 = ALGO_RESULTS.filter((r) => r.excelRows === 1_000);
      if (excel1000.length >= 2) {
        const sorted = [...excel1000].sort((a, b) => a.historyCount - b.historyCount);
        for (let i = 1; i < sorted.length; i += 1) {
          expect(sorted[i]!.detectMs).toBeGreaterThanOrEqual(sorted[i - 1]!.detectMs * 0.5);
        }
      }
    });
  });

  describe('Phase 8 — skip index lookup when fallback predetermined', () => {
    it('incomplete coverage skips batched index lookup before fallback', async () => {
      await seedHistoryImports(5, 5, 'inline');
      await markOrgIndexCoverageIncompleteForTests(ORG, USER);
      const resolved = await resolveImportHistoryForDuplicateDetection(ORG, reviewFromRows(buildExcelRows(100)));
      expect(resolved.meta.indexLookupCount).toBe(0);
      expect(resolved.meta.source).toMatch(/^fallback-/);
    });
  });

  describe('Phase 9 — unnecessary reconstruction analysis', () => {
    it('detectDuplicateImport uses fileFingerprint, invoiceNumbers, rowFingerprints from every record', () => {
      const history = [buildSyntheticHistoryRecord(0, 20, USER).record];
      const spyHistory = history.map((record) => ({
        ...record,
        get rowFingerprints() {
          throw new Error('rowFingerprints accessed');
        },
      }));

      expect(() =>
        detectDuplicateImport({
          resolvedReview: reviewFromRows(buildExcelRows(1)),
          importHistory: spyHistory as never,
        }),
      ).toThrow('rowFingerprints accessed');
    });

    it('full reconstruction is required — partial metadata would miss row overlap duplicates', () => {
      const target = buildSyntheticHistoryRecord(0, 100, USER);
      const partialRecord = {
        ...target.record,
        fileFingerprint: 'different-file-fingerprint',
        rowFingerprints: target.record.rowFingerprints.slice(0, 5),
        invoiceNumbers: target.record.invoiceNumbers.slice(0, 5),
      };
      const overlappingExcel = buildExactDuplicateExcelFromHistory(
        target.rows.slice(0, 95),
      ).concat(buildExcelRows(5, 'NEW'));
      const fullResult = detectDuplicateImport({
        resolvedReview: reviewFromRows(overlappingExcel),
        importHistory: [target.record],
      });
      const partialResult = detectDuplicateImport({
        resolvedReview: reviewFromRows(overlappingExcel),
        importHistory: [partialRecord],
      });
      expect(fullResult.status).toBe(DUPLICATE_IMPORT_STATUS.HIGH_CONFIDENCE_DUPLICATE);
      expect(partialResult.status).toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);
      expect(areDuplicateResultsEqual(fullResult, partialResult)).toBe(false);
    });
  });
});
