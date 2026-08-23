/**
 * Import index health — coverage gating, safe fallback, repair, and performance probes.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildDuplicateImportFingerprints,
  DUPLICATE_IMPORT_STATUS,
  IMPORT_HISTORY_STATUS,
  type ImportHistoryRecord,
} from '@/lib/import/duplicate';
import {
  compareDuplicateDetectionPaths,
  resolveImportHistoryForDuplicateDetection,
} from '@/lib/import/duplicate/import-duplicate-index-candidate.service';
import {
  finalizeIndexedHistoryForTests,
} from '@/lib/import/duplicate/import-index-health.test-helpers';
import { ORG_IMPORT_INDEX_COVERAGE } from '@/lib/import/duplicate/import-index-health.types';
import {
  importIndexHealthService,
  importIndexRepairService,
} from '@/lib/import/duplicate/import-index-repair.service';
import type { ImportReviewViewModelWithResolution, ResolvedImportReviewRow } from '@/lib/import/resolution/types';
import { SALES_DETAIL_REPORT } from '@/lib/import/reports/definitions';
import {
  AUTO_IMPORT_RECOMMENDATION,
  CONFIDENCE_LEVEL,
} from '@/lib/import/services/confidence-engine.service';
import { CONFLICT_ENGINE_STATUS } from '@/lib/import/services/conflict-engine.service';
import { PRODUCT_MATCH_STATUS } from '@/lib/import/services/product-matching.service';
import { importDuplicateIndexRepository } from '@/lib/repositories/import-duplicate-index.repository';
import { importHistoryRepository } from '@/lib/repositories/import-history.repository';
import { importIndexHealthRepository } from '@/lib/repositories/import-index-health.repository';
import { withCollectionGroupMock } from '@/lib/import/duplicate/import-duplicate-index-collection-group.mock';
import { verifyImportDuplicateIndexHits } from '@/lib/import/duplicate/import-index-verification';

const scheduleAfterResponseMock = vi.hoisted(() => vi.fn((_task: () => Promise<void>) => true));

vi.mock('@/lib/server/schedule-after-response', () => ({
  scheduleAfterResponse: (task: () => Promise<void>) => scheduleAfterResponseMock(task),
}));

const ORG = 'org-health';
const USER = 'user-health';

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
      limit(_count: number) {
        return buildQuery(basePath, field, op, value, max);
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
                    set: subRef.set,
                  };
                },
                where: subCollection.where,
                get: subCollection.get,
              };
            },
            set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
              const existing = docs.get(ref.path) ?? {};
              docs.set(ref.path, options?.merge ? { ...existing, ...data } : data);
            },
          };
        },
      };
    },
    batch: () => {
      const ops: Array<{ ref: { path: string }; data: Record<string, unknown> }> = [];
      return {
        set(ref: { path: string }, data: Record<string, unknown>, options?: { merge?: boolean }) {
          ops.push({ ref, data: options?.merge ? { ...(docs.get(ref.path) ?? {}), ...data } : data });
        },
        async commit() {
          for (const op of ops) {
            docs.set(op.ref.path, op.data);
          }
        },
      };
    },
  },
    docs,
  );

  return { docs, db };
}

const harness = vi.hoisted(() => ({
  current: null as ReturnType<typeof createInMemoryFirestore> | null,
}));

vi.mock('@/lib/repositories/base.repository', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/repositories/base.repository')>();

  return {
    ...original,
    getFirestore: () => harness.current!.db,
    getOrgCollection: (orgId: string, collectionName: string) =>
      harness.current!.db.collection('organizations').doc(orgId).collection(collectionName),
  };
});

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
            duplicateIndexStatus: data.duplicateIndexStatus as ImportHistoryRecord['duplicateIndexStatus'],
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
          duplicateIndexStatus: data.duplicateIndexStatus as ImportHistoryRecord['duplicateIndexStatus'],
          rowsImported: Number(data.rowsImported),
          rowsSkipped: Number(data.rowsSkipped),
          rowsFailed: Number(data.rowsFailed),
          saleIds: (data.saleIds as string[]) ?? [],
          executionStatus: data.executionStatus as ImportHistoryRecord['status'],
        };
      },
    },
  };
});

function baseRow(
  rowNumber: number,
  values: Record<string, unknown>,
  overrides: Partial<ResolvedImportReviewRow> = {},
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
    ...overrides,
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

describe('import index health', () => {
  beforeEach(() => {
    harness.current = createInMemoryFirestore();
  });

  it('CRITICAL: partial index with unrelated candidate still detects true duplicate', async () => {
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

    const parity = await compareDuplicateDetectionPaths(ORG, {
      resolvedReview: reviewWithRows(uploadRows),
      importHistory: fullHistory,
    });

    expect(parity.matches).toBe(true);
    expect(parity.newResult.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    expect(parity.newResult.matchedImport?.importId).toBe('imp-75');
    expect(parity.meta.source).toBe('fallback-incomplete');
  });

  it('uses fast path when org coverage is complete', async () => {
    const rows = [baseRow(2, { saleDate: '2026-08-21', customerName: 'A', productName: 'Bread', quantity: 1, saleNumber: 'INV-1' })];
    const fp = buildDuplicateImportFingerprints(rows);
    const history = [
      historyRecord({
        importId: 'imp-1',
        fileFingerprint: fp.fileFingerprint,
        rowFingerprints: fp.rowFingerprints,
        invoiceNumbers: fp.invoiceNumbers,
      }),
    ];

    await seedHistory(ORG, history);
    await indexRecords(ORG, history);
    await finalizeIndexedHistoryForTests(ORG, USER, history);

    const listSpy = vi.spyOn(importHistoryRepository, 'list');
    const resolved = await resolveImportHistoryForDuplicateDetection(ORG, reviewWithRows(rows));

    expect(resolved.meta.source).toBe('index');
    expect(resolved.meta.orgCoverage).toBe(ORG_IMPORT_INDEX_COVERAGE.COMPLETE);
    expect(listSpy).not.toHaveBeenCalled();
    listSpy.mockRestore();
  });

  it('repairs failed index and marks org complete after verification', async () => {
    const rows = [baseRow(2, { saleDate: '2026-08-21', customerName: 'A', productName: 'Bread', quantity: 1 })];
    const fp = buildDuplicateImportFingerprints(rows);
    const history = [
      historyRecord({
        importId: 'imp-repair',
        fileFingerprint: fp.fileFingerprint,
        rowFingerprints: fp.rowFingerprints,
        invoiceNumbers: fp.invoiceNumbers,
      }),
    ];

    await seedHistory(ORG, history);

    const result = await importIndexRepairService.repairOrganizationIndex(ORG, USER);

    expect(result.coverage).toBe(ORG_IMPORT_INDEX_COVERAGE.COMPLETE);
    expect(result.stillIncompleteCount).toBe(0);

    const meta = await importIndexHealthRepository.getOrgCoverage(ORG);
    expect(meta?.coverage).toBe(ORG_IMPORT_INDEX_COVERAGE.COMPLETE);
  });

  it('persistImportDuplicateIndexForImport writes index hits after import completes', async () => {
    const rows = [
      baseRow(2, {
        saleDate: '2026-08-21',
        customerName: 'A',
        productName: 'Bread',
        quantity: 1,
        saleNumber: 'INV-DEFER',
      }),
    ];
    const fp = buildDuplicateImportFingerprints(rows);
    const history = [
      historyRecord({
        importId: 'imp-deferred',
        fileFingerprint: fp.fileFingerprint,
        rowFingerprints: fp.rowFingerprints,
        invoiceNumbers: fp.invoiceNumbers,
      }),
    ];

    await seedHistory(ORG, history);

    await importIndexHealthService.persistImportDuplicateIndexForImport(ORG, USER, 'imp-deferred');

    const verified = await verifyImportDuplicateIndexHits(
      ORG,
      'imp-deferred',
      fp.invoiceNumbers,
      fp.rowFingerprints,
    );
    expect(verified).toBe(true);

    const meta = await importIndexHealthRepository.getOrgCoverage(ORG);
    expect(meta?.coverage).toBe(ORG_IMPORT_INDEX_COVERAGE.COMPLETE);
  });

  it('scheduleDeferredImportDuplicateIndexWrite runs persistence via scheduleAfterResponse', async () => {
    scheduleAfterResponseMock.mockReset();
    let capturedTask: (() => Promise<void>) | null = null;
    scheduleAfterResponseMock.mockImplementation((task: () => Promise<void>) => {
      capturedTask = task;
      return true;
    });

    const rows = [
      baseRow(2, {
        saleDate: '2026-08-21',
        customerName: 'A',
        productName: 'Bread',
        quantity: 1,
        saleNumber: 'INV-SCHED',
      }),
    ];
    const fp = buildDuplicateImportFingerprints(rows);
    await seedHistory(ORG, [
      historyRecord({
        importId: 'imp-scheduled',
        fileFingerprint: fp.fileFingerprint,
        rowFingerprints: fp.rowFingerprints,
        invoiceNumbers: fp.invoiceNumbers,
      }),
    ]);

    importIndexHealthService.scheduleDeferredImportDuplicateIndexWrite({
      orgId: ORG,
      userId: USER,
      importId: 'imp-scheduled',
    });

    expect(scheduleAfterResponseMock).toHaveBeenCalledOnce();
    expect(capturedTask).not.toBeNull();
    await capturedTask!();

    const verified = await verifyImportDuplicateIndexHits(
      ORG,
      'imp-scheduled',
      fp.invoiceNumbers,
      fp.rowFingerprints,
    );
    expect(verified).toBe(true);
  });
});

describe('import index health — performance probes (mock)', () => {
  beforeEach(() => {
    harness.current = createInMemoryFirestore();
  });

  const historySizes = [100, 1000] as const;

  for (const historySize of historySizes) {
    it(`complete index: ${historySize} history + 10 rows does not list full history`, async () => {
      const uploadRows = Array.from({ length: 10 }, (_, index) =>
        baseRow(index + 2, {
          saleDate: '2026-08-21',
          customerName: `Store ${index}`,
          productName: 'Bread',
          quantity: 1,
          saleNumber: `INV-${index}`,
        }),
      );
      const fp = buildDuplicateImportFingerprints(uploadRows);
      const history = Array.from({ length: historySize }, (_, index) =>
        historyRecord({
          importId: `imp-${index}`,
          fileFingerprint: index === 50 ? fp.fileFingerprint : `fp-${index}`,
          rowFingerprints: index === 50 ? fp.rowFingerprints : [`row-${index}`],
          invoiceNumbers: index === 50 ? fp.invoiceNumbers : [`NOISE-${index}`],
        }),
      );

      await seedHistory(ORG, history);
      await indexRecords(ORG, history);
      await finalizeIndexedHistoryForTests(ORG, USER, history);

      const listSpy = vi.spyOn(importHistoryRepository, 'list');
      const resolved = await resolveImportHistoryForDuplicateDetection(ORG, reviewWithRows(uploadRows));

      expect(resolved.meta.source).toBe('index');
      expect(listSpy).not.toHaveBeenCalled();
      expect(resolved.importHistory.length).toBeLessThan(historySize);
      listSpy.mockRestore();
    });
  }

  it('incomplete index: full-history fallback lists all history', async () => {
    const historySize = 100;
    const uploadRows = [baseRow(2, { saleDate: '2026-08-21', customerName: 'A', productName: 'Bread', quantity: 1 })];
    const history = Array.from({ length: historySize }, (_, index) =>
      historyRecord({
        importId: `imp-${index}`,
        fileFingerprint: `fp-${index}`,
        rowFingerprints: [`row-${index}`],
        invoiceNumbers: [`NOISE-${index}`],
      }),
    );

    await seedHistory(ORG, history);

    const listSpy = vi.spyOn(importHistoryRepository, 'list');
    const resolved = await resolveImportHistoryForDuplicateDetection(ORG, reviewWithRows(uploadRows));

    expect(resolved.meta.source).toBe('fallback-incomplete');
    expect(listSpy).toHaveBeenCalledOnce();
    expect(resolved.importHistory).toHaveLength(historySize);
    listSpy.mockRestore();
  });
});
