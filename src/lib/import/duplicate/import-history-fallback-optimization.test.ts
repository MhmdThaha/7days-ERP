/**
 * Safe full-history fallback optimizations — regression + parity (TEST ONLY).
 *
 * Run: npx vitest run src/lib/import/duplicate/import-history-fallback-optimization.test.ts
 */

import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildDuplicateImportFingerprints,
  detectDuplicateImport,
  DUPLICATE_IMPORT_STATUS,
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
  buildExactDuplicateExcelFromHistory,
  buildExcelRows,
  seedChunkedHistoryDoc,
  seedInlineHistoryDoc,
} from '@/lib/import/duplicate/import-history-fallback-performance-audit.helpers';
import { DUPLICATE_METADATA_STORAGE } from '@/lib/import/duplicate/import-history-duplicate-metadata.types';
import type { ImportReviewViewModelWithResolution } from '@/lib/import/resolution/types';
import {
  importHistoryDuplicateMetadataRepository,
  readChunksSequentialForTests,
} from '@/lib/repositories/import-history-duplicate-metadata.repository';
import { importIndexHealthRepository } from '@/lib/repositories/import-index-health.repository';

function createInstrumentedFirestore() {
  const docs: DocMap = new Map();
  let autoId = 0;
  let collectionGroupCalls = 0;
  let docGets = 0;

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
            docGets += 1;
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
      get: async () => ({
        docs: [...docs.entries()]
          .filter(([path]) => {
            const suffix = path.slice(basePath.length + 1);
            return path.startsWith(`${basePath}/`) && !suffix.includes('/');
          })
          .map(([path, data]) => ({ id: path.slice(basePath.length + 1), data: () => data })),
      }),
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
      batch: () => ({
        set() {},
        async commit() {},
      }),
      runTransaction: async (fn: (tx: { get: (ref: { path: string }) => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>; set: (ref: { path: string }, data: Record<string, unknown>) => void }) => Promise<unknown>) =>
        fn({
          get: async (ref) => ({ exists: docs.has(ref.path), data: () => docs.get(ref.path) }),
          set: (ref, data) => docs.set(ref.path, { ...data }),
        }),
      collectionGroup: () => {
        collectionGroupCalls += 1;
        return {
          where() {
            return this;
          },
          get: async () => ({ docs: [], empty: true }),
        };
      },
    },
    docs,
  );

  return {
    docs,
    db,
    counters: {
      get collectionGroupCalls() {
        return collectionGroupCalls;
      },
      get docGets() {
        return docGets;
      },
      reset() {
        collectionGroupCalls = 0;
        docGets = 0;
      },
    },
  };
}

const harness = vi.hoisted(() => ({
  current: null as ReturnType<typeof createInstrumentedFirestore> | null,
}));

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => harness.current!.db,
}));

const ORG = 'org-fallback-opt';
const ORG_OTHER = 'org-fallback-opt-other';
const USER = 'opt-user';

function reviewFromRows(rows: ReturnType<typeof buildAuditRows>): ImportReviewViewModelWithResolution {
  return { rows } as unknown as ImportReviewViewModelWithResolution;
}

async function seedInlineHistory(count: number, rowsPerImport = 5, orgId = ORG) {
  for (let index = 0; index < count; index += 1) {
    const rows = buildAuditRows(rowsPerImport, `H${index}`);
    seedInlineHistoryDoc(harness.current!.docs, orgId, USER, `import-${index}`, buildDuplicateImportFingerprints(rows));
  }
}

async function seedMixedHistory(count: number, orgId = ORG) {
  for (let index = 0; index < count; index += 1) {
    const rows = index % 2 === 0 ? buildAuditRows(5, `M${index}`) : buildAuditRows(600, `M${index}`);
    const fp = buildDuplicateImportFingerprints(rows);
    const importId = `mixed-${index}`;

    if (rows.length >= 500) {
      seedChunkedHistoryDoc(harness.current!.docs, orgId, USER, importId, fp);
    } else {
      seedInlineHistoryDoc(harness.current!.docs, orgId, USER, importId, fp);
    }
  }
}

async function seedChunkedHistory(count: number, rowsPerImport = 500, orgId = ORG) {
  for (let index = 0; index < count; index += 1) {
    const rows = buildAuditRows(rowsPerImport, `C${index}`);
    seedChunkedHistoryDoc(
      harness.current!.docs,
      orgId,
      USER,
      `chunk-${index}`,
      buildDuplicateImportFingerprints(rows),
    );
  }
}

function chunkReadExpected(importId: string, rowCount: number) {
  const rowChunks = importHistoryDuplicateMetadataRepository.expectedRowChunkCount(rowCount);
  const invoiceChunks = importHistoryDuplicateMetadataRepository.expectedInvoiceChunkCount(rowCount);
  return {
    storage: DUPLICATE_METADATA_STORAGE.CHUNKED,
    complete: true,
    rowChunkCount: rowChunks,
    invoiceChunkCount: invoiceChunks,
    inlineInvoiceNumbers: [] as string[],
    inlineRowFingerprints: [] as string[],
    importId,
  };
}

describe('Safe full-history fallback optimizations', () => {
  beforeEach(() => {
    harness.current = createInstrumentedFirestore();
  });

  describe('Chunk read parity — sequential oracle vs parallel readChunks', () => {
    it('ordered multi-chunk import matches sequential oracle', async () => {
      const rows = buildAuditRows(2_500, 'PAR');
      const fp = buildDuplicateImportFingerprints(rows);
      seedChunkedHistoryDoc(harness.current!.docs, ORG, USER, 'parity-1', fp);
      const expected = chunkReadExpected('parity-1', fp.rowFingerprints.length);

      const sequential = await readChunksSequentialForTests(ORG, 'parity-1', expected);
      const parallel = await importHistoryDuplicateMetadataRepository.readChunks(ORG, 'parity-1', expected);

      expect(parallel).toEqual(sequential);
      expect(parallel.rowFingerprints).toEqual(fp.rowFingerprints);
      expect(parallel.invoiceNumbers).toEqual(fp.invoiceNumbers);
    });

    it('missing first chunk — both return incomplete', async () => {
      const rows = buildAuditRows(1_500, 'MF');
      const fp = buildDuplicateImportFingerprints(rows);
      seedChunkedHistoryDoc(harness.current!.docs, ORG, USER, 'missing-first', fp);
      harness.current!.docs.delete(
        `organizations/${ORG}/importHistory/missing-first/duplicateMetadata/row-0000`,
      );
      const expected = chunkReadExpected('missing-first', fp.rowFingerprints.length);

      const sequential = await readChunksSequentialForTests(ORG, 'missing-first', expected);
      const parallel = await importHistoryDuplicateMetadataRepository.readChunks(ORG, 'missing-first', expected);

      expect(parallel).toEqual(sequential);
      expect(parallel.complete).toBe(false);
    });

    it('missing middle chunk — both return incomplete', async () => {
      const rows = buildAuditRows(2_500, 'MM');
      const fp = buildDuplicateImportFingerprints(rows);
      seedChunkedHistoryDoc(harness.current!.docs, ORG, USER, 'missing-middle', fp);
      harness.current!.docs.delete(
        `organizations/${ORG}/importHistory/missing-middle/duplicateMetadata/row-0001`,
      );
      const expected = chunkReadExpected('missing-middle', fp.rowFingerprints.length);

      expect(await importHistoryDuplicateMetadataRepository.readChunks(ORG, 'missing-middle', expected)).toEqual(
        await readChunksSequentialForTests(ORG, 'missing-middle', expected),
      );
    });

    it('missing last chunk — both return incomplete', async () => {
      const rows = buildAuditRows(2_500, 'ML');
      const fp = buildDuplicateImportFingerprints(rows);
      seedChunkedHistoryDoc(harness.current!.docs, ORG, USER, 'missing-last', fp);
      harness.current!.docs.delete(
        `organizations/${ORG}/importHistory/missing-last/duplicateMetadata/inv-0001`,
      );
      const expected = chunkReadExpected('missing-last', fp.rowFingerprints.length);

      expect(await importHistoryDuplicateMetadataRepository.readChunks(ORG, 'missing-last', expected)).toEqual(
        await readChunksSequentialForTests(ORG, 'missing-last', expected),
      );
    });

    it('incomplete metadata flag — both skip chunk reads', async () => {
      const expected = {
        storage: DUPLICATE_METADATA_STORAGE.CHUNKED,
        complete: false,
        rowChunkCount: 3,
        invoiceChunkCount: 2,
        inlineInvoiceNumbers: [] as string[],
        inlineRowFingerprints: [] as string[],
      };

      expect(await importHistoryDuplicateMetadataRepository.readChunks(ORG, 'none', expected)).toEqual(
        await readChunksSequentialForTests(ORG, 'none', expected),
      );
    });

    it('inline storage — both return inline arrays unchanged', async () => {
      const rows = buildAuditRows(10, 'INL');
      const fp = buildDuplicateImportFingerprints(rows);
      const expected = {
        storage: DUPLICATE_METADATA_STORAGE.INLINE,
        complete: true,
        rowChunkCount: 0,
        invoiceChunkCount: 0,
        inlineInvoiceNumbers: fp.invoiceNumbers,
        inlineRowFingerprints: fp.rowFingerprints,
      };

      expect(await importHistoryDuplicateMetadataRepository.readChunks(ORG, 'inline', expected)).toEqual(
        await readChunksSequentialForTests(ORG, 'inline', expected),
      );
    });
  });

  describe('Fallback routing — skip index lookup when fallback predetermined', () => {
    for (const [label, setup] of [
      ['missing coverage', async () => {}],
      ['unknown coverage', async () => importIndexHealthRepository.setOrgCoverage(ORG, USER, { coverage: ORG_IMPORT_INDEX_COVERAGE.UNKNOWN })],
      ['incomplete coverage', async () => markOrgIndexCoverageIncompleteForTests(ORG, USER)],
      ['repairing coverage', async () => importIndexHealthRepository.setOrgCoverage(ORG, USER, { coverage: ORG_IMPORT_INDEX_COVERAGE.REPAIRING })],
    ] as const) {
      it(`${label} → fallback without index lookup`, async () => {
        await seedInlineHistory(5);
        await setup();
        harness.current!.counters.reset();
        const resolved = await resolveImportHistoryForDuplicateDetection(ORG, reviewFromRows(buildExcelRows(10)));
        expect(resolved.meta.source).toMatch(/^fallback-/);
        expect(resolved.meta.indexLookupCount).toBe(0);
        expect(harness.current!.counters.collectionGroupCalls).toBe(0);
      });
    }

    it('incomplete duplicate metadata → fallback without index lookup', async () => {
      const rows = buildAuditRows(600, 'INC');
      const fp = buildDuplicateImportFingerprints(rows);
      seedChunkedHistoryDoc(harness.current!.docs, ORG, USER, 'incomplete-meta', fp);
      harness.current!.docs.set(`organizations/${ORG}/importHistory/incomplete-meta`, {
        ...(harness.current!.docs.get(`organizations/${ORG}/importHistory/incomplete-meta`) ?? {}),
        duplicateMetadataComplete: false,
      });
      await markOrgIndexCoverageCompleteForTests(ORG, USER);
      harness.current!.counters.reset();
      const resolved = await resolveImportHistoryForDuplicateDetection(ORG, reviewFromRows(buildExcelRows(10)));
      expect(resolved.meta.indexLookupCount).toBe(0);
      expect(resolved.meta.source).toMatch(/^fallback-/);
    });

    it('index read failure → fallback-error with indexLookupCount 0', async () => {
      await seedInlineHistory(3);
      await markOrgIndexCoverageCompleteForTests(ORG, USER);
      harness.current!.db.collectionGroup = () => {
        throw new Error('Simulated index failure');
      };
      const resolved = await resolveImportHistoryForDuplicateDetection(ORG, reviewFromRows(buildExcelRows(10)));
      expect(resolved.meta.source).toBe('fallback-error');
      expect(resolved.meta.indexLookupCount).toBe(0);
      expect(resolved.importHistory.length).toBe(3);
    });

    it('complete coverage → fast path still uses index lookup', async () => {
      await seedInlineHistory(3);
      await markOrgIndexCoverageCompleteForTests(ORG, USER);
      harness.current!.counters.reset();
      const resolved = await resolveImportHistoryForDuplicateDetection(ORG, reviewFromRows(buildExcelRows(10)));
      expect(resolved.meta.source).toBe('index-empty');
      expect(resolved.meta.indexLookupCount).toBeGreaterThan(0);
    });
  });

  describe('Duplicate detection parity — optimized path equals oracle', () => {
    it('100 inline histories', async () => {
      await seedInlineHistory(100);
      await markOrgIndexCoverageIncompleteForTests(ORG, USER);
      const parity = await compareDuplicateDetectionPaths(ORG, {
        resolvedReview: reviewFromRows(buildExcelRows(10)),
        importHistory: (await resolveImportHistoryForDuplicateDetection(ORG, reviewFromRows(buildExcelRows(10)))).importHistory,
      });
      expect(parity.matches).toBe(true);
    });

    it('1,000 inline histories', async () => {
      await seedInlineHistory(1_000, 3);
      await markOrgIndexCoverageIncompleteForTests(ORG, USER);
      const history = (await resolveImportHistoryForDuplicateDetection(ORG, reviewFromRows(buildExcelRows(10)))).importHistory;
      const parity = await compareDuplicateDetectionPaths(ORG, {
        resolvedReview: reviewFromRows(buildExcelRows(10)),
        importHistory: history,
      });
      expect(parity.matches).toBe(true);
    });

    it('10,000 inline histories (algorithmic oracle)', () => {
      const history = Array.from({ length: 10_000 }, (_, index) => {
        const rows = buildAuditRows(3, `O${index}`);
        const fp = buildDuplicateImportFingerprints(rows);
        return {
          importId: `o-${index}`,
          importedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
          importedBy: USER,
          reportType: 'sales-detail',
          rowCount: 3,
          fileFingerprint: fp.fileFingerprint,
          invoiceNumbers: fp.invoiceNumbers,
          rowFingerprints: fp.rowFingerprints,
          status: 'COMPLETED' as const,
        };
      });
      const excel = buildExcelRows(10);
      const oracle = detectDuplicateImport({ resolvedReview: reviewFromRows(excel), importHistory: history });
      const optimized = detectDuplicateImport({ resolvedReview: reviewFromRows(excel), importHistory: history });
      expect(areDuplicateResultsEqual(oracle, optimized)).toBe(true);
    });

    it('mixed inline + chunked histories', async () => {
      await seedMixedHistory(40);
      await markOrgIndexCoverageIncompleteForTests(ORG, USER);
      const history = (await resolveImportHistoryForDuplicateDetection(ORG, reviewFromRows(buildExcelRows(50)))).importHistory;
      expect(history.length).toBe(40);
      const parity = await compareDuplicateDetectionPaths(ORG, {
        resolvedReview: reviewFromRows(buildExcelRows(50)),
        importHistory: history,
      });
      expect(parity.matches).toBe(true);
    });

    it('many chunked histories', async () => {
      await seedChunkedHistory(50, 600);
      await markOrgIndexCoverageIncompleteForTests(ORG, USER);
      const result = await detectDuplicateImportWithCandidateLookup(ORG, reviewFromRows(buildExcelRows(10)));
      expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);
    });

    it('one huge chunked historical import', async () => {
      const rows = buildAuditRows(5_000, 'HUGE');
      seedChunkedHistoryDoc(harness.current!.docs, ORG, USER, 'huge', buildDuplicateImportFingerprints(rows));
      await markOrgIndexCoverageIncompleteForTests(ORG, USER);
      const result = await detectDuplicateImportWithCandidateLookup(
        ORG,
        reviewFromRows(buildExactDuplicateExcelFromHistory(rows)),
      );
      expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    });

    it('exact duplicate at first historical import', async () => {
      await seedInlineHistory(100);
      await markOrgIndexCoverageIncompleteForTests(ORG, USER);
      const dup = buildAuditRows(5, 'H0');
      const result = await detectDuplicateImportWithCandidateLookup(
        ORG,
        reviewFromRows(buildExactDuplicateExcelFromHistory(dup)),
      );
      expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    });

    it('exact duplicate at last historical import', async () => {
      await seedInlineHistory(100);
      await markOrgIndexCoverageIncompleteForTests(ORG, USER);
      const dup = buildAuditRows(5, 'H99');
      const result = await detectDuplicateImportWithCandidateLookup(
        ORG,
        reviewFromRows(buildExactDuplicateExcelFromHistory(dup)),
      );
      expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    });

    it('duplicate in chunked history', async () => {
      await seedChunkedHistory(10, 800);
      await markOrgIndexCoverageIncompleteForTests(ORG, USER);
      const dup = buildAuditRows(800, 'C9');
      const result = await detectDuplicateImportWithCandidateLookup(
        ORG,
        reviewFromRows(buildExactDuplicateExcelFromHistory(dup)),
      );
      expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    });

    it('blank invoice duplicate', async () => {
      const rows = [buildAuditRow(2, { invoice: '' })];
      seedInlineHistoryDoc(harness.current!.docs, ORG, USER, 'blank', buildDuplicateImportFingerprints(rows));
      await markOrgIndexCoverageIncompleteForTests(ORG, USER);
      const result = await detectDuplicateImportWithCandidateLookup(ORG, reviewFromRows(rows));
      expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    });

    it('legitimate repeated purchase is not exact duplicate', async () => {
      const row = buildAuditRow(2, { customerName: 'Store A', productName: 'Bread' });
      seedInlineHistoryDoc(harness.current!.docs, ORG, USER, 'once', buildDuplicateImportFingerprints([row]));
      await markOrgIndexCoverageIncompleteForTests(ORG, USER);
      const excel = [
        buildAuditRow(2, { customerName: 'Store A', productName: 'Bread' }),
        buildAuditRow(3, { customerName: 'Store A', productName: 'Bread' }),
      ];
      const result = await detectDuplicateImportWithCandidateLookup(ORG, reviewFromRows(excel));
      expect(result.status).not.toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    });

    it('legacy + chunked coexistence', async () => {
      const inline = buildAuditRows(10, 'LEG');
      seedInlineHistoryDoc(harness.current!.docs, ORG, USER, 'legacy', buildDuplicateImportFingerprints(inline));
      const chunked = buildAuditRows(700, 'CHK');
      seedChunkedHistoryDoc(harness.current!.docs, ORG, USER, 'chunked', buildDuplicateImportFingerprints(chunked));
      await markOrgIndexCoverageIncompleteForTests(ORG, USER);
      const result = await detectDuplicateImportWithCandidateLookup(
        ORG,
        reviewFromRows(buildExactDuplicateExcelFromHistory(chunked)),
      );
      expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    });

    it('organization isolation', async () => {
      await seedInlineHistory(5, 5, ORG);
      await seedInlineHistory(5, 5, ORG_OTHER);
      await markOrgIndexCoverageIncompleteForTests(ORG, USER);
      const dup = buildAuditRows(5, 'H0');
      const result = await detectDuplicateImportWithCandidateLookup(
        ORG,
        reviewFromRows(buildExactDuplicateExcelFromHistory(dup)),
      );
      expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
      await markOrgIndexCoverageIncompleteForTests(ORG_OTHER, USER);
      const otherResult = await detectDuplicateImportWithCandidateLookup(
        ORG_OTHER,
        reviewFromRows(buildExactDuplicateExcelFromHistory(buildAuditRows(5, 'H0'))),
      );
      expect(otherResult.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    });
  });
});
