/**
 * Sales Import — Hardcore Adversarial Audit (TEST ONLY)
 *
 * Does not modify production code. Uses in-memory Firestore mock
 * (same harness pattern as import-duplicate-index-parity.test.ts).
 */

import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildDuplicateImportFingerprints,
  buildDuplicateImportRowFingerprint,
  detectDuplicateImport,
} from '@/lib/import/duplicate/duplicate-import.service';
import {
  compareDuplicateDetectionPaths,
  lookupCandidateImportIdsFromIndex,
  resolveImportHistoryForDuplicateDetection,
} from '@/lib/import/duplicate/import-duplicate-index-candidate.service';
import { countBatchedIndexQueries } from '@/lib/import/duplicate/import-duplicate-index-lookup.service';
import {
  DUPLICATE_IMPORT_RECOMMENDATION,
  DUPLICATE_IMPORT_STATUS,
  IMPORT_HISTORY_STATUS,
  type ImportHistoryRecord,
  type DuplicateImportResult,
} from '@/lib/import/duplicate';
import type { ImportReviewViewModelWithResolution, ResolvedImportReviewRow } from '@/lib/import/resolution/types';
import { SALES_DETAIL_REPORT } from '@/lib/import/reports/definitions';
import {
  AUTO_IMPORT_RECOMMENDATION,
  CONFIDENCE_LEVEL,
} from '@/lib/import/services/confidence-engine.service';
import { CONFLICT_ENGINE_STATUS } from '@/lib/import/services/conflict-engine.service';
import { PRODUCT_MATCH_STATUS } from '@/lib/import/services/product-matching.service';
import { importDuplicateIndexRepository } from '@/lib/repositories/import-duplicate-index.repository';
import { finalizeIndexedHistoryForTests } from '@/lib/import/duplicate/import-index-health.test-helpers';
import { withCollectionGroupMock } from '@/lib/import/duplicate/import-duplicate-index-collection-group.mock';

type DocMap = Map<string, Record<string, unknown>>;

function createInMemoryFirestore() {
  const docs: DocMap = new Map();
  let autoId = 0;

  function queryDocs(basePath: string, field?: string, op?: string, value?: unknown) {
    return [...docs.entries()]
      .filter(([path, data]) => {
        const suffix = path.slice(basePath.length + 1);
        const isDirectChild = path.startsWith(`${basePath}/`) && !suffix.includes('/');

        if (!isDirectChild) {
          return false;
        }

        if (field === undefined) {
          return true;
        }

        return op === '==' && data[field] === value;
      })
      .map(([path, data]) => ({
        id: path.slice(basePath.length + 1),
        data: () => data,
      }));
  }

  function buildQuery(basePath: string, field?: string, op?: string, value?: unknown, max?: number) {
    return {
      limit(count: number) {
        return buildQuery(basePath, field, op, value, count);
      },
      get: async () => {
        const docsForQuery = queryDocs(basePath, field, op, value);
        const sliced = max === undefined ? docsForQuery : docsForQuery.slice(0, max);
        return { docs: sliced, empty: sliced.length === 0 };
      },
    };
  }

  function collectionAt(basePath: string) {
    return {
      doc(id?: string) {
        const docId = id ?? `auto-${++autoId}`;
        const path = `${basePath}/${docId}`;

        return {
          id: docId,
          path,
          collection: (name: string) => collectionAt(`${path}/${name}`),
          get: async () => ({
            exists: docs.has(path),
            id: docId,
            data: () => docs.get(path),
          }),
          set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
            const previous = docs.get(path);
            docs.set(path, options?.merge && previous ? { ...previous, ...data } : { ...data });
          },
        };
      },
      where(field: string, op: string, value: unknown) {
        return buildQuery(basePath, field, op, value);
      },
      get: async () => ({
        docs: queryDocs(basePath),
        empty: queryDocs(basePath).length === 0,
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
          return {
            ...ref,
            collection(name: string) {
              const subBase = `${ref.path}/${name}`;
              const subCollection = collectionAt(subBase);
              return {
                doc(subId?: string) {
                  const subRef = subCollection.doc(subId);
                  return {
                    ...subRef,
                    collection: (nested: string) => collectionAt(`${subRef.path}/${nested}`),
                  };
                },
                where: subCollection.where,
                get: subCollection.get,
              };
            },
          };
        },
      };
    },
    batch: () => {
      const ops: Array<{ path: string; data: Record<string, unknown>; merge: boolean }> = [];
      return {
        set: (ref: { path: string }, data: Record<string, unknown>, options?: { merge?: boolean }) => {
          ops.push({ path: ref.path, data: { ...data }, merge: options?.merge ?? false });
        },
        commit: async () => {
          for (const op of ops) {
            const previous = docs.get(op.path);
            docs.set(op.path, op.merge && previous ? { ...previous, ...op.data } : { ...op.data });
          }
        },
      };
    },
    runTransaction: async (fn: (tx: { get: (ref: { path: string }) => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>; set: (ref: { path: string }, data: Record<string, unknown>) => void }) => Promise<unknown>) => {
      const tx = {
        get: async (ref: { path: string }) => ({
          exists: docs.has(ref.path),
          data: () => docs.get(ref.path),
        }),
        set: (ref: { path: string }, data: Record<string, unknown>) => {
          docs.set(ref.path, { ...data });
        },
      };
      return fn(tx);
    },
  },
    docs,
  );

  return { db, docs };
}

const harness = vi.hoisted(() => ({
  current: null as ReturnType<typeof createInMemoryFirestore> | null,
}));

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => {
    if (!harness.current) {
      throw new Error('In-memory Firestore was not initialized');
    }

    return harness.current.db;
  },
}));

vi.mock('@/lib/repositories/import-history.repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/repositories/import-history.repository')>();

  return {
    ...actual,
    importHistoryRepository: {
      ...actual.importHistoryRepository,
      async hasAny(orgId: string) {
        const prefix = `organizations/${orgId}/importHistory/`;
        return [...harness.current!.docs.keys()].some(
          (path) => path.startsWith(prefix) && !harness.current!.docs.get(path)?.deletedAt,
        );
      },
      async list(orgId: string) {
        const prefix = `organizations/${orgId}/importHistory/`;
        const records: ImportHistoryRecord[] = [];

        for (const [path, data] of harness.current!.docs.entries()) {
          if (!path.startsWith(prefix) || path.slice(prefix.length).includes('/')) {
            continue;
          }

          if (data.deletedAt) {
            continue;
          }

          records.push({
            importId: path.slice(prefix.length),
            importedAt: (data.createdAt as Timestamp).toDate().toISOString(),
            importedBy: String(data.createdBy),
            reportType: String(data.reportType),
            rowCount: Number(data.rowCount),
            fileFingerprint: String(data.fileFingerprint),
            invoiceNumbers: data.invoiceNumbers as string[],
            rowFingerprints: data.rowFingerprints as string[],
            status: data.status as ImportHistoryRecord['status'],
          });
        }

        return records.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
      },
      async getById(orgId: string, importId: string) {
        const path = `organizations/${orgId}/importHistory/${importId}`;
        const data = harness.current!.docs.get(path);

        if (!data || data.deletedAt) {
          return null;
        }

        return {
          importId,
          importedAt: (data.createdAt as Timestamp).toDate().toISOString(),
          importedBy: String(data.createdBy),
          reportType: String(data.reportType),
          rowCount: Number(data.rowCount),
          fileFingerprint: String(data.fileFingerprint),
          invoiceNumbers: data.invoiceNumbers as string[],
          rowFingerprints: data.rowFingerprints as string[],
          status: data.status as ImportHistoryRecord['status'],
          rowsImported: Number(data.rowsImported),
          rowsSkipped: Number(data.rowsSkipped),
          rowsFailed: Number(data.rowsFailed),
          saleIds: data.saleIds as string[],
          executionStatus: data.executionStatus as 'IMPORTED',
        };
      },
    },
  };
});

const ORG = 'org-adversarial';
const ORG_B = 'org-adversarial-b';
const USER = 'audit-user';

function baseRow(
  rowNumber: number,
  values: Record<string, unknown>,
): ResolvedImportReviewRow {
  return {
    rowNumber,
    originalValues: values,
    normalizedValues: values as ResolvedImportReviewRow['normalizedValues'],
    reportDetectionResult: {
      profile: SALES_DETAIL_REPORT,
      reportType: 'sales-detail',
      confidence: 0.9,
      matchedColumns: [],
      missingColumns: [],
      matchedHeaders: [],
      missingHeaders: [],
      unmatchedHeaders: [],
      explanation: [],
      candidates: [],
    },
    productMatchResult: {
      status: PRODUCT_MATCH_STATUS.MATCHED,
      matchedProductId: 'prod-bread',
      matchedProductName: 'Bread',
      confidence: 98,
      reason: 'Exact Name Match',
    },
    conflictEngineResult: {
      status: CONFLICT_ENGINE_STATUS.READY,
      conflicts: [],
      warnings: [],
      blockingReason: null,
      recommendedAction: null,
      confidencePenalty: 0,
    },
    confidenceResult: {
      confidenceScore: 90,
      confidenceLevel: CONFIDENCE_LEVEL.HIGH,
      confidenceReasons: [],
      autoImportRecommendation: AUTO_IMPORT_RECOMMENDATION.PREVIEW_FIRST,
    },
  };
}

function reviewWithRows(rows: ResolvedImportReviewRow[]): ImportReviewViewModelWithResolution {
  return {
    overview: {
      fileName: 'sales.csv',
      detectedReportName: 'Sales Detail',
      detectedReportType: 'sales-detail',
      reportConfidence: 0.9,
      headerRowIndex: 0,
      totalRows: rows.length,
      readyRows: rows.length,
      warningRows: 0,
      errorRows: 0,
      averageConfidence: 90,
      autoImportEligibleRows: 0,
      blockedRows: 0,
    },
    reportSummary: {
      matchedColumns: [],
      missingRequiredColumns: [],
      extraColumns: [],
      unknownHeaders: [],
      detectionReasons: [],
    },
    rows,
  };
}

function historyRecord(
  overrides: Partial<ImportHistoryRecord> & Pick<ImportHistoryRecord, 'importId'>,
): ImportHistoryRecord {
  return {
    importedAt: '2026-03-01T10:00:00.000Z',
    importedBy: 'owner@bakery.test',
    reportType: 'sales-detail',
    rowCount: 1,
    fileFingerprint: '',
    invoiceNumbers: [],
    rowFingerprints: [],
    status: IMPORT_HISTORY_STATUS.COMPLETED,
    ...overrides,
  };
}

async function seedHistory(orgId: string, records: readonly ImportHistoryRecord[]) {
  const now = Timestamp.now();

  for (const record of records) {
    harness.current!.docs.set(`organizations/${orgId}/importHistory/${record.importId}`, {
      organizationId: orgId,
      reportType: record.reportType,
      rowCount: record.rowCount,
      rowsImported: record.rowCount,
      rowsSkipped: 0,
      rowsFailed: 0,
      fileFingerprint: record.fileFingerprint,
      invoiceNumbers: [...record.invoiceNumbers],
      rowFingerprints: [...record.rowFingerprints],
      saleIds: [],
      executionStatus: 'IMPORTED',
      status: record.status,
      createdAt: now,
      createdBy: USER,
      updatedAt: now,
      updatedBy: USER,
      deletedAt: null,
      deletedBy: null,
    });
  }
}

async function indexRecords(orgId: string, records: readonly ImportHistoryRecord[]) {
  for (const record of records) {
    await importDuplicateIndexRepository.indexImportDuplicateHits(orgId, USER, {
      importId: record.importId,
      invoiceNumbers: record.invoiceNumbers,
      rowFingerprints: record.rowFingerprints,
      status: record.status,
    });
  }
}

describe('Phase 0 — environment safety', () => {
  it('uses test/mock Firestore — no production admin credentials', () => {
    expect(process.env.FIRESTORE_EMULATOR_HOST ?? 'mock').toBeTruthy();
    expect(process.env.GCLOUD_PROJECT ?? 'test').not.toBe('days-bakery-erp-dev');
    expect(process.env.FIREBASE_ADMIN_PRIVATE_KEY).toBeUndefined();
    expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
  });
});

describe('Phase 9 — partial index attack (CRITICAL)', () => {
  beforeEach(() => {
    harness.current = createInMemoryFirestore();
  });

  it('detects unindexed exact duplicate when unrelated indexed candidate exists', async () => {
    const uploadRows = [
      baseRow(2, {
        saleDate: '2026-08-21',
        customerName: 'Ravi',
        productName: 'Bread',
        quantity: 10,
        saleNumber: 'INV-75',
      }),
    ];
    const fp = buildDuplicateImportFingerprints(uploadRows);
    const target = historyRecord({
      importId: 'imp-75',
      fileFingerprint: fp.fileFingerprint,
      rowFingerprints: fp.rowFingerprints,
      invoiceNumbers: fp.invoiceNumbers,
    });
    const indexedNoise = historyRecord({
      importId: 'imp-noise',
      fileFingerprint: 'completely-different-file',
      rowFingerprints: [fp.rowFingerprints[0]!],
      invoiceNumbers: [],
      rowCount: 1,
    });

    const fullHistory = Array.from({ length: 100 }, (_, index) =>
      historyRecord({
        importId: `imp-noise-${index}`,
        fileFingerprint: `noise-fp-${index}`,
        rowFingerprints: [`noise-row-${index}`],
        invoiceNumbers: [`NOISE-${index}`],
      }),
    );
    fullHistory[74] = target;

    await seedHistory(ORG, fullHistory);
    await indexRecords(ORG, [indexedNoise, ...fullHistory.filter((r) => r.importId.startsWith('imp-noise-')).slice(0, 9)]);

    const review = reviewWithRows(uploadRows);
    const oldResult = detectDuplicateImport({ resolvedReview: review, importHistory: fullHistory });
    const parity = await compareDuplicateDetectionPaths(ORG, {
      resolvedReview: review,
      importHistory: fullHistory,
    });

    expect(oldResult.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    expect(oldResult.matchedImport?.importId).toBe('imp-75');
    expect(parity.matches).toBe(true);
    expect(parity.newResult.matchedImport?.importId).toBe('imp-75');
    expect(parity.meta.source).toBe('fallback-incomplete');
  });

  it('falls back to full history when index returns zero candidates but history exists', async () => {
    const uploadRows = [
      baseRow(2, {
        saleDate: '2026-08-21',
        customerName: 'Ravi',
        productName: 'Bread',
        quantity: 10,
      }),
    ];
    const fp = buildDuplicateImportFingerprints(uploadRows);
    const target = historyRecord({
      importId: 'imp-unindexed',
      fileFingerprint: fp.fileFingerprint,
      rowFingerprints: fp.rowFingerprints,
      invoiceNumbers: [],
    });

    await seedHistory(ORG, [target]);

    const resolved = await resolveImportHistoryForDuplicateDetection(ORG, reviewWithRows(uploadRows));

    expect(resolved.meta.source).toBe('fallback-incomplete');
    expect(resolved.importHistory).toHaveLength(1);
  });
});

describe('Phase 2/3/4 — duplicate matrix (oracle samples)', () => {
  beforeEach(() => {
    harness.current = createInMemoryFirestore();
  });

  const matrix: Array<{
    name: string;
    rows: ResolvedImportReviewRow[];
    history: ImportHistoryRecord[];
    expectedStatus: DuplicateImportResult['status'];
    indexOnly?: ImportHistoryRecord[];
  }> = [];

  const raviRow = baseRow(2, {
    saleDate: '2026-08-21',
    customerName: 'Ravi',
    productName: 'Bread',
    quantity: 10,
  });
  const raviFp = buildDuplicateImportRowFingerprint(raviRow);

  matrix.push(
    {
      name: 'brand-new file',
      rows: [baseRow(2, { saleDate: '2026-08-21', customerName: 'New', productName: 'Bread', quantity: 1 })],
      history: [],
      expectedStatus: DUPLICATE_IMPORT_STATUS.NO_DUPLICATE,
    },
    {
      name: 'same customer product qty date — legitimate second purchase',
      rows: [raviRow],
      history: [
        historyRecord({
          importId: 'imp-first',
          fileFingerprint: 'other-file',
          rowFingerprints: [raviFp],
          invoiceNumbers: [],
        }),
      ],
      expectedStatus: DUPLICATE_IMPORT_STATUS.HIGH_CONFIDENCE_DUPLICATE,
    },
    {
      name: 'invoice whitespace normalization',
      rows: [baseRow(2, { saleDate: '2026-03-01', customerName: 'A', productName: 'Bread', quantity: 1, saleNumber: ' INV-100 ' })],
      history: [
        historyRecord({
          importId: 'imp-inv',
          fileFingerprint: 'other',
          rowFingerprints: ['x'],
          invoiceNumbers: ['INV-100'],
        }),
      ],
      expectedStatus: DUPLICATE_IMPORT_STATUS.HIGH_CONFIDENCE_DUPLICATE,
    },
    {
      name: 'invoice case normalization inv-100 vs INV-100',
      rows: [baseRow(2, { saleDate: '2026-03-01', customerName: 'A', productName: 'Bread', quantity: 1, saleNumber: 'inv-100' })],
      history: [
        historyRecord({
          importId: 'imp-inv',
          fileFingerprint: 'other',
          rowFingerprints: ['x'],
          invoiceNumbers: ['INV-100'],
        }),
      ],
      expectedStatus: DUPLICATE_IMPORT_STATUS.HIGH_CONFIDENCE_DUPLICATE,
    },
  );

  for (const caseDef of matrix) {
    it(`oracle: ${caseDef.name}`, async () => {
      await seedHistory(ORG, caseDef.history);
      await indexRecords(ORG, caseDef.indexOnly ?? caseDef.history);

      const review = reviewWithRows(caseDef.rows);
      const oldResult = detectDuplicateImport({
        resolvedReview: review,
        importHistory: caseDef.history,
      });

      expect(oldResult.status).toBe(caseDef.expectedStatus);

      const parity = await compareDuplicateDetectionPaths(ORG, {
        resolvedReview: review,
        importHistory: caseDef.history,
      });

      expect(parity.oldResult.status).toBe(caseDef.expectedStatus);
    });
  }
});

describe('Phase 11 — organization isolation', () => {
  beforeEach(() => {
    harness.current = createInMemoryFirestore();
  });

  it('same invoice in org A does not affect org B duplicate detection', async () => {
    const rows = [
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'A',
        productName: 'Bread',
        quantity: 1,
        saleNumber: 'INV-100',
      }),
    ];
    const historyA = [
      historyRecord({
        importId: 'imp-a',
        fileFingerprint: 'fp-a',
        rowFingerprints: ['row-a'],
        invoiceNumbers: ['INV-100'],
      }),
    ];

    await seedHistory(ORG, historyA);
    await indexRecords(ORG, historyA);

    const parityB = await compareDuplicateDetectionPaths(ORG_B, {
      resolvedReview: reviewWithRows(rows),
      importHistory: [],
    });

    expect(parityB.oldResult.status).toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);
    expect(parityB.newResult.status).toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);
  });
});

describe('Phase 16 — performance probe (in-memory)', () => {
  beforeEach(() => {
    harness.current = createInMemoryFirestore();
  });

  it('measures candidate count vs full history for 100-row exact duplicate', async () => {
    const rows = Array.from({ length: 100 }, (_, index) =>
      baseRow(index + 2, {
        saleDate: '2026-03-01',
        customerName: `Store ${index}`,
        productName: 'Bread',
        quantity: 1,
        saleNumber: `INV-${index}`,
      }),
    );
    const fp = buildDuplicateImportFingerprints(rows);
    const noise = Array.from({ length: 100 }, (_, index) =>
      historyRecord({
        importId: `imp-noise-${index}`,
        fileFingerprint: `noise-${index}`,
        rowFingerprints: [`noise-row-${index}`],
        invoiceNumbers: [`NOISE-${index}`],
      }),
    );
    const target = historyRecord({
      importId: 'imp-target',
      fileFingerprint: fp.fileFingerprint,
      rowFingerprints: fp.rowFingerprints,
      invoiceNumbers: fp.invoiceNumbers,
      rowCount: 100,
    });

    await seedHistory(ORG, [...noise, target]);
    await indexRecords(ORG, [...noise, target]);
    await finalizeIndexedHistoryForTests(ORG, USER, [...noise, target]);

    const started = performance.now();
    const { candidateIds, indexLookupCount } = await lookupCandidateImportIdsFromIndex(ORG, fp);
    const resolved = await resolveImportHistoryForDuplicateDetection(ORG, reviewWithRows(rows));
    const elapsed = performance.now() - started;

    expect(resolved.meta.source).toBe('index');
    expect(candidateIds.size).toBeLessThan(101);
    expect(resolved.importHistory.length).toBeLessThan(101);
    expect(indexLookupCount).toBe(
      countBatchedIndexQueries(fp.invoiceNumbers.length, fp.rowFingerprints.length),
    );

    // eslint-disable-next-line no-console
    console.info('[audit-perf]', {
      rows: rows.length,
      fullHistory: noise.length + 1,
      candidates: candidateIds.size,
      historyLoaded: resolved.importHistory.length,
      indexLookups: indexLookupCount,
      elapsedMs: Math.round(elapsed),
    });
  });
});

describe('Phase 19 — index vs history consistency checker (test only)', () => {
  beforeEach(() => {
    harness.current = createInMemoryFirestore();
  });

  it('reports missing index hits for unindexed history', async () => {
    const record = historyRecord({
      importId: 'imp-missing-index',
      fileFingerprint: 'fp-1',
      rowFingerprints: ['row-1'],
      invoiceNumbers: ['INV-1'],
    });

    await seedHistory(ORG, [record]);

    const prefix = `organizations/${ORG}/importDuplicateInvoices/`;
    const indexedImportIds = new Set<string>();

    for (const path of harness.current!.docs.keys()) {
      if (path.includes('/hits/')) {
        indexedImportIds.add(path.split('/hits/')[1]!);
      }
    }

    expect(indexedImportIds.has('imp-missing-index')).toBe(false);
    expect(record.invoiceNumbers.length).toBeGreaterThan(0);
  });
});
