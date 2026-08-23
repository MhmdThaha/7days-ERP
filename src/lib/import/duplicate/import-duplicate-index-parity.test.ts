/**
 * Phase 4B — index proof tests (in-memory Firestore mock).
 * Proves OLD full-history duplicate decisions match NEW index-candidate path.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildDuplicateImportFingerprints,
  buildDuplicateImportRowFingerprint,
} from '@/lib/import/duplicate/duplicate-import.service';
import {
  compareDuplicateDetectionPaths,
  lookupCandidateImportIdsFromIndex,
} from '@/lib/import/duplicate/import-duplicate-index-candidate.service';
import {
  lookupCandidateImportIdsFromIndexBatched,
  lookupCandidateImportIdsFromIndexSequential,
} from '@/lib/import/duplicate/import-duplicate-index-lookup.service';
import {
  DUPLICATE_IMPORT_RECOMMENDATION,
  DUPLICATE_IMPORT_STATUS,
  IMPORT_HISTORY_STATUS,
  type ImportHistoryRecord,
} from '@/lib/import/duplicate';
import type { ImportReviewViewModelWithResolution, ResolvedImportReviewRow } from '@/lib/import/resolution/types';
import { SALES_DETAIL_REPORT } from '@/lib/import/reports/definitions';
import {
  AUTO_IMPORT_RECOMMENDATION,
  CONFIDENCE_LEVEL,
} from '@/lib/import/services/confidence-engine.service';
import { CONFLICT_ENGINE_STATUS } from '@/lib/import/services/conflict-engine.service';
import { PRODUCT_MATCH_STATUS } from '@/lib/import/services/product-matching.service';
import {
  IMPORT_DUPLICATE_INDEX_MAX_BATCH_WRITES,
  importDuplicateIndexRepository,
  normalizeInvoiceForDuplicateIndex,
} from '@/lib/repositories/import-duplicate-index.repository';
import { finalizeIndexedHistoryForTests, markOrgIndexCoverageCompleteForTests } from '@/lib/import/duplicate/import-index-health.test-helpers';
import { hashImportIdentity, importHistoryRepository } from '@/lib/repositories/import-history.repository';

type DocMap = Map<string, Record<string, unknown>>;

type DocRef = {
  id: string;
  path: string;
  collection: (name: string) => CollectionRef;
  get: () => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined; id: string }>;
  set?: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void>;
};

type CollectionRef = {
  doc: (id?: string) => DocRef;
  where: (field: string, op: string, value: unknown) => QueryRef;
  get: () => Promise<{ docs: Array<{ id: string; data: () => Record<string, unknown> }> }>;
};

type QueryRef = {
  limit: (count: number) => QueryRef;
  get: () => Promise<{ docs: Array<{ id: string; data: () => Record<string, unknown> }>; empty: boolean }>;
};

function createInMemoryFirestore(failBatchIndexes: readonly number[] = []) {
  const docs: DocMap = new Map();
  let autoId = 0;
  let batchCounter = 0;

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
    const run = () => {
      const docsForQuery = queryDocs(basePath, field, op, value);
      return max === undefined ? docsForQuery : docsForQuery.slice(0, max);
    };

    return {
      limit(count: number) {
        return buildQuery(basePath, field, op, value, count);
      },
      get: async () => {
        const docsForQuery = run();
        return {
          docs: docsForQuery,
          empty: docsForQuery.length === 0,
        };
      },
    };
  }

  function collectionAt(basePath: string): CollectionRef {
    return {
      doc(id?: string): DocRef {
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

  function subcollectionGet(basePath: string) {
    return [...docs.entries()]
      .filter(([path]) => path.startsWith(`${basePath}/`))
      .map(([path, data]) => ({
        id: path.slice(basePath.length + 1),
        data: () => data,
      }));
  }

  function collectionGroupQuery(collectionName: string) {
    const filters: Array<{ field: string; op: string; value: unknown }> = [];

    function matchingDocs() {
      return [...docs.entries()]
        .filter(([path, data]) => {
          const marker = `/${collectionName}/`;
          const markerIndex = path.indexOf(marker);

          if (markerIndex === -1) {
            return false;
          }

          const suffix = path.slice(markerIndex + marker.length);

          if (suffix.includes('/')) {
            return false;
          }

          for (const filter of filters) {
            if (filter.op === '==') {
              if (data[filter.field] !== filter.value) {
                return false;
              }
            } else if (filter.op === 'in') {
              const values = filter.value as unknown[];

              if (!values.includes(data[filter.field])) {
                return false;
              }
            }
          }

          return true;
        })
        .map(([path, data]) => ({
          id: path.slice(path.lastIndexOf('/') + 1),
          data: () => data,
        }));
    }

    const queryBuilder = {
      where(field: string, op: string, value: unknown) {
        filters.push({ field, op, value });
        return queryBuilder;
      },
      get: async () => {
        if (harness.throwOnIndexRead && collectionName === 'hits') {
          throw new Error('Simulated index lookup failure');
        }

        const docsForQuery = matchingDocs();

        return {
          docs: docsForQuery,
          empty: docsForQuery.length === 0,
        };
      },
    };

    return queryBuilder;
  }

  const db = {
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
                get: async () => {
                  if (
                    harness.throwOnIndexRead &&
                    (subBase.includes('/importDuplicateInvoices/') ||
                      subBase.includes('/importDuplicateRows/'))
                  ) {
                    throw new Error('Simulated index lookup failure');
                  }

                  return subCollection.get();
                },
              };
            },
          };
        },
      };
    },
    collectionGroup: (name: string) => collectionGroupQuery(name),
    batch: () => {
      const batchIndex = batchCounter++;
      const ops: Array<{
        path: string;
        data: Record<string, unknown>;
        merge: boolean;
      }> = [];

      return {
        set: (
          ref: DocRef,
          data: Record<string, unknown>,
          options?: { merge?: boolean },
        ) => {
          ops.push({ path: ref.path, data: { ...data }, merge: options?.merge ?? false });
        },
        commit: async () => {
          if (failBatchIndexes.includes(batchIndex)) {
            throw new Error('Firestore batch unavailable');
          }

          for (const op of ops) {
            const previous = docs.get(op.path);

            if (op.merge && previous) {
              docs.set(op.path, { ...previous, ...op.data });
            } else {
              docs.set(op.path, { ...op.data });
            }
          }
        },
      };
    },
  };

  return { db, docs, batchCounter: () => batchCounter };
}

const harness = vi.hoisted(() => ({
  current: null as ReturnType<typeof createInMemoryFirestore> | null,
  failBatchIndexes: [] as number[],
  throwOnIndexRead: false,
}));

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => {
    if (!harness.current) {
      throw new Error('In-memory Firestore was not initialized');
    }

    return harness.current.db;
  },
}));

const ORG_A = 'org-parity-a';
const ORG_B = 'org-parity-b';
const USER = 'parity-user';

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

async function indexHistoryRecords(
  orgId: string,
  records: readonly ImportHistoryRecord[],
) {
  for (const record of records) {
    await importDuplicateIndexRepository.indexImportDuplicateHits(orgId, USER, {
      importId: record.importId,
      invoiceNumbers: record.invoiceNumbers,
      rowFingerprints: record.rowFingerprints,
      status: record.status,
    });
  }
}

function invoiceHitPath(orgId: string, invoice: string, importId: string) {
  const normalized = normalizeInvoiceForDuplicateIndex(invoice)!;
  const hash = hashImportIdentity(normalized);

  return `organizations/${orgId}/importDuplicateInvoices/${hash}/hits/${importId}`;
}

function rowHitPath(orgId: string, fingerprint: string, importId: string) {
  const hash = hashImportIdentity(fingerprint);

  return `organizations/${orgId}/importDuplicateRows/${hash}/hits/${importId}`;
}

async function expectParity(
  orgId: string,
  review: ImportReviewViewModelWithResolution,
  importHistory: readonly ImportHistoryRecord[],
) {
  const parity = await compareDuplicateDetectionPaths(orgId, {
    resolvedReview: review,
    importHistory,
  });

  expect(parity.matches, JSON.stringify(parity, null, 2)).toBe(true);

  return parity;
}

describe('Phase 4B — TEST 1 normal import index hits', () => {
  beforeEach(() => {
    harness.failBatchIndexes = [];
    harness.current = createInMemoryFirestore(harness.failBatchIndexes);
  });

  it('indexes every unique invoice and row fingerprint for a mixed import', async () => {
    const rows = [
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'Store A',
        productName: 'Bread',
        quantity: 2,
        saleNumber: 'INV-100',
      }),
      baseRow(3, {
        saleDate: '2026-03-02',
        customerName: 'Store B',
        productName: 'Cake',
        quantity: 1,
        saleNumber: 'INV-200',
      }),
      baseRow(4, {
        saleDate: '2026-03-03',
        customerName: 'Store C',
        productName: 'Puff',
        quantity: 3,
      }),
    ];
    const fingerprints = buildDuplicateImportFingerprints(rows);
    const importId = 'imp-normal';

    const result = await importDuplicateIndexRepository.indexImportDuplicateHits(ORG_A, USER, {
      importId,
      invoiceNumbers: fingerprints.invoiceNumbers,
      rowFingerprints: fingerprints.rowFingerprints,
      status: IMPORT_HISTORY_STATUS.IMPORTING,
    });

    expect(result.success).toBe(true);
    expect(result.invoiceHitsWritten).toBe(2);
    expect(result.rowHitsWritten).toBe(3);

    expect(harness.current?.docs.get(invoiceHitPath(ORG_A, 'INV-100', importId))).toMatchObject({
      invoiceNormalized: 'INV-100',
      organizationId: ORG_A,
    });
    expect(harness.current?.docs.get(invoiceHitPath(ORG_A, 'INV-200', importId))).toBeDefined();

    for (const fingerprint of fingerprints.rowFingerprints) {
      expect(harness.current?.docs.get(rowHitPath(ORG_A, fingerprint, importId))).toMatchObject({
        organizationId: ORG_A,
        importId,
      });
    }
  });
});

describe('Phase 4B — TEST 2 idempotency', () => {
  beforeEach(() => {
    harness.failBatchIndexes = [];
    harness.current = createInMemoryFirestore(harness.failBatchIndexes);
  });

  it('keeps one hit document per hash/importId when indexed repeatedly', async () => {
    const input = {
      importId: 'imp-idem',
      invoiceNumbers: ['INV-1', 'inv-1'],
      rowFingerprints: ['fp-a', 'fp-a', 'fp-b'],
      status: IMPORT_HISTORY_STATUS.IMPORTING,
    } as const;

    await importDuplicateIndexRepository.indexImportDuplicateHits(ORG_A, USER, input);
    await importDuplicateIndexRepository.indexImportDuplicateHits(ORG_A, USER, {
      ...input,
      status: IMPORT_HISTORY_STATUS.COMPLETED,
    });
    await importDuplicateIndexRepository.indexImportDuplicateHits(ORG_A, USER, {
      ...input,
      status: IMPORT_HISTORY_STATUS.COMPLETED,
    });

    expect(harness.current?.docs.size).toBe(3);
    expect(harness.current?.docs.get(invoiceHitPath(ORG_A, 'INV-1', 'imp-idem'))).toMatchObject({
      status: IMPORT_HISTORY_STATUS.COMPLETED,
    });
  });
});

describe('Phase 4B — TEST 5 organization isolation', () => {
  beforeEach(() => {
    harness.failBatchIndexes = [];
    harness.current = createInMemoryFirestore(harness.failBatchIndexes);
  });

  it('keeps INV-100 hits scoped to each organization', async () => {
    await importDuplicateIndexRepository.indexImportDuplicateHits(ORG_A, USER, {
      importId: 'imp-a',
      invoiceNumbers: ['INV-100'],
      rowFingerprints: ['row-a'],
      status: IMPORT_HISTORY_STATUS.COMPLETED,
    });
    await importDuplicateIndexRepository.indexImportDuplicateHits(ORG_B, USER, {
      importId: 'imp-b',
      invoiceNumbers: ['INV-100'],
      rowFingerprints: ['row-b'],
      status: IMPORT_HISTORY_STATUS.COMPLETED,
    });

    const orgACandidates = await lookupCandidateImportIdsFromIndex(ORG_A, {
      fileFingerprint: '',
      invoiceNumbers: ['INV-100'],
      rowFingerprints: [],
    });
    const orgBCandidates = await lookupCandidateImportIdsFromIndex(ORG_B, {
      fileFingerprint: '',
      invoiceNumbers: ['INV-100'],
      rowFingerprints: [],
    });

    expect([...orgACandidates.candidateIds]).toEqual(['imp-a']);
    expect([...orgBCandidates.candidateIds]).toEqual(['imp-b']);
    expect(harness.current?.docs.get(invoiceHitPath(ORG_A, 'INV-100', 'imp-a'))?.organizationId).toBe(
      ORG_A,
    );
    expect(harness.current?.docs.get(invoiceHitPath(ORG_B, 'INV-100', 'imp-b'))?.organizationId).toBe(
      ORG_B,
    );
  });
});

describe('Phase 4C — TEST 7 old imports without index (fallback)', () => {
  beforeEach(() => {
    harness.failBatchIndexes = [];
    harness.current = createInMemoryFirestore(harness.failBatchIndexes);
  });

  it('falls back to full history when index is empty but history exists', async () => {
    const rows = [
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'Metro',
        productName: 'Bread',
        quantity: 2,
        saleNumber: 'INV-10',
      }),
    ];
    const fingerprints = buildDuplicateImportFingerprints(rows);
    const history = [
      historyRecord({
        importId: 'imp-pre-index',
        fileFingerprint: fingerprints.fileFingerprint,
        rowFingerprints: fingerprints.rowFingerprints,
        invoiceNumbers: fingerprints.invoiceNumbers,
      }),
    ];

    await seedHistory(ORG_A, history);

    const parity = await compareDuplicateDetectionPaths(ORG_A, {
      resolvedReview: reviewWithRows(rows),
      importHistory: history,
    });

    expect(parity.oldResult.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    expect(parity.newResult.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    expect(parity.matches).toBe(true);
    expect(parity.meta.source).toBe('fallback-incomplete');
    expect(parity.candidateImportIds).toEqual([]);
    expect(parity.candidateHistoryCount).toBe(1);
  });
});

describe('Phase 4B — OLD vs NEW parity scenarios', () => {
  beforeEach(() => {
    harness.failBatchIndexes = [];
    harness.current = createInMemoryFirestore(harness.failBatchIndexes);
  });

  async function runScenario(
    label: string,
    rows: ResolvedImportReviewRow[],
    history: ImportHistoryRecord[],
  ) {
    await seedHistory(ORG_A, history);
    await indexHistoryRecords(ORG_A, history);
    await finalizeIndexedHistoryForTests(ORG_A, USER, history);

    const parity = await expectParity(ORG_A, reviewWithRows(rows), history);

    expect(parity.candidateHistoryCount).toBeLessThanOrEqual(parity.fullHistoryCount);

    return { label, parity };
  }

  it('1. same file retry — EXACT_DUPLICATE / BLOCK', async () => {
    const rows = [
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'Metro',
        productName: 'Bread',
        quantity: 2,
        saleNumber: 'INV-10',
      }),
    ];
    const fp = buildDuplicateImportFingerprints(rows);

    await runScenario('same file retry', rows, [
      historyRecord({
        importId: 'imp-1',
        status: IMPORT_HISTORY_STATUS.COMPLETED,
        fileFingerprint: fp.fileFingerprint,
        rowFingerprints: fp.rowFingerprints,
        invoiceNumbers: fp.invoiceNumbers,
      }),
    ]);
  });

  it('2. same numbered invoice — HIGH_CONFIDENCE / BLOCK', async () => {
    const rows = [
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'A',
        productName: 'Bread',
        quantity: 1,
        saleNumber: 'INV-1',
      }),
      baseRow(3, {
        saleDate: '2026-03-01',
        customerName: 'B',
        productName: 'Puff',
        quantity: 1,
        saleNumber: 'INV-2',
      }),
    ];

    const parity = await runScenario('same numbered invoice', rows, [
      historyRecord({
        importId: 'imp-inv',
        fileFingerprint: 'different-file',
        rowFingerprints: ['other-row'],
        invoiceNumbers: ['INV-1', 'INV-2'],
        rowCount: 2,
      }),
    ]);

    expect(parity.parity.oldResult.recommendation).toBe(DUPLICATE_IMPORT_RECOMMENDATION.BLOCK_IMPORT);
  });

  it('3. different invoice numbers — NO_DUPLICATE / CONTINUE', async () => {
    const rows = [
      baseRow(2, {
        saleDate: '2026-03-05',
        customerName: 'Safeer Bai',
        productName: 'Bread',
        quantity: 20,
        saleNumber: 'INV-NEW',
      }),
    ];

    await runScenario('different invoice numbers', rows, [
      historyRecord({
        importId: 'imp-old',
        fileFingerprint: 'other',
        rowFingerprints: [
          buildDuplicateImportRowFingerprint(
            baseRow(3, {
              saleDate: '2026-03-04',
              customerName: 'Safeer Bai',
              productName: 'Bread',
              quantity: 20,
              saleNumber: 'INV-OLD',
            }),
          ),
        ],
        invoiceNumbers: ['INV-OLD'],
      }),
    ]);
  });

  it('4. same customer + product + quantity but legitimate separate import — NO_DUPLICATE', async () => {
    const rows = [
      baseRow(2, {
        saleDate: '2026-03-05',
        customerName: 'Safeer Bai',
        productName: 'Bread',
        quantity: 20,
        amount: 700,
      }),
    ];
    const priorDay = buildDuplicateImportRowFingerprint(
      baseRow(3, {
        saleDate: '2026-03-04',
        customerName: 'Safeer Bai',
        productName: 'Bread',
        quantity: 20,
        amount: 700,
      }),
    );

    await runScenario('legitimate separate import', rows, [
      historyRecord({
        importId: 'imp-daily',
        fileFingerprint: 'other-file',
        rowFingerprints: [priorDay],
        invoiceNumbers: [],
      }),
    ]);
  });

  it('5. unnumbered rows — NO_DUPLICATE when only one overlapping row in large file', async () => {
    const loneRow = baseRow(2, {
      saleDate: '2026-03-01',
      customerName: 'Metro',
      productName: 'Bread',
      quantity: 2,
    });
    const loneFingerprint = buildDuplicateImportRowFingerprint(loneRow);
    const rows = [
      loneRow,
      baseRow(3, {
        saleDate: '2026-03-02',
        customerName: 'Fresh',
        productName: 'Cake',
        quantity: 1,
      }),
      baseRow(4, {
        saleDate: '2026-03-03',
        customerName: 'Fresh',
        productName: 'Tart',
        quantity: 1,
      }),
    ];

    const parity = await runScenario('unnumbered rows', rows, [
      historyRecord({
        importId: 'imp-one-row',
        fileFingerprint: 'different',
        rowFingerprints: [loneFingerprint],
        invoiceNumbers: [],
      }),
    ]);

    expect(parity.parity.oldResult.status).toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);
  });

  it('6. multiple unnumbered rows — POSSIBLE_DUPLICATE / REVIEW', async () => {
    const row = baseRow(2, {
      saleDate: '2026-03-01',
      customerName: 'Metro',
      productName: 'Bread',
      quantity: 2,
    });
    const rowFp = buildDuplicateImportRowFingerprint(row);
    const rows = [
      row,
      baseRow(3, {
        saleDate: '2026-03-02',
        customerName: 'New Store',
        productName: 'Cake',
        quantity: 5,
      }),
      baseRow(4, {
        saleDate: '2026-03-03',
        customerName: 'Another',
        productName: 'Tart',
        quantity: 3,
      }),
    ];

    const parity = await runScenario('multiple unnumbered rows', rows, [
      historyRecord({
        importId: 'imp-partial',
        fileFingerprint: 'other',
        rowFingerprints: [rowFp, buildDuplicateImportRowFingerprint(rows[1]!)],
        invoiceNumbers: [],
        rowCount: 2,
      }),
    ]);

    expect(parity.parity.oldResult.recommendation).toBe(DUPLICATE_IMPORT_RECOMMENDATION.REVIEW);
  });

  it('7. same date + same customer grouping — NO_DUPLICATE for different lines', async () => {
    const morning = buildDuplicateImportRowFingerprint(
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'Safeer Bai',
        productName: 'Bread',
        quantity: 10,
        saleNumber: 'INV-AM',
      }),
    );
    const rows = [
      baseRow(3, {
        saleDate: '2026-03-01',
        customerName: 'Safeer Bai',
        productName: 'Bread',
        quantity: 20,
        saleNumber: 'INV-PM',
      }),
    ];

    await runScenario('same date same customer different lines', rows, [
      historyRecord({
        importId: 'imp-twice',
        fileFingerprint: 'other',
        rowFingerprints: [morning],
        invoiceNumbers: ['INV-AM'],
      }),
    ]);
  });

  it('8. partial import overlap — SKIP_DUPLICATES via row majority', async () => {
    const sharedRows = Array.from({ length: 10 }, (_, index) =>
      baseRow(index + 2, {
        saleDate: '2026-03-01',
        customerName: `Store ${index}`,
        productName: 'Bread',
        quantity: 2,
        saleNumber: `INV-${index}`,
      }),
    );
    const historyFingerprints = buildDuplicateImportFingerprints(sharedRows.slice(0, 9));

    const parity = await runScenario('partial import overlap', sharedRows, [
      historyRecord({
        importId: 'imp-rows',
        fileFingerprint: 'other-file',
        rowFingerprints: historyFingerprints.rowFingerprints,
        invoiceNumbers: [],
        rowCount: 9,
      }),
    ]);

    expect(parity.parity.oldResult.recommendation).toBe(
      DUPLICATE_IMPORT_RECOMMENDATION.SKIP_DUPLICATES,
    );
  });

  it('9. failed import in history is ignored by both paths', async () => {
    const rows = [
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'Metro',
        productName: 'Bread',
        quantity: 2,
        saleNumber: 'INV-10',
      }),
    ];
    const fp = buildDuplicateImportFingerprints(rows);

    await runScenario('failed import ignored', rows, [
      historyRecord({
        importId: 'imp-failed',
        status: IMPORT_HISTORY_STATUS.FAILED,
        fileFingerprint: fp.fileFingerprint,
        rowFingerprints: fp.rowFingerprints,
        invoiceNumbers: fp.invoiceNumbers,
      }),
    ]);
  });

  it('10. completed import blocks exact duplicate', async () => {
    const rows = [
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'Metro',
        productName: 'Bread',
        quantity: 2,
        saleNumber: 'INV-10',
      }),
    ];
    const fp = buildDuplicateImportFingerprints(rows);

    const parity = await runScenario('completed import', rows, [
      historyRecord({
        importId: 'imp-completed',
        status: IMPORT_HISTORY_STATUS.COMPLETED,
        fileFingerprint: fp.fileFingerprint,
        rowFingerprints: fp.rowFingerprints,
        invoiceNumbers: fp.invoiceNumbers,
      }),
    ]);

    expect(parity.parity.oldResult.matchedImport?.importId).toBe('imp-completed');
  });

  it('11. multiple historical imports — best match preserved', async () => {
    const rows = [
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'Metro',
        productName: 'Bread',
        quantity: 2,
        saleNumber: 'INV-10',
      }),
    ];
    const fp = buildDuplicateImportFingerprints(rows);

    const parity = await runScenario('multiple historical imports', rows, [
      historyRecord({
        importId: 'imp-noise',
        fileFingerprint: 'noise',
        rowFingerprints: ['other-fp'],
        invoiceNumbers: ['INV-999'],
      }),
      historyRecord({
        importId: 'imp-exact',
        status: IMPORT_HISTORY_STATUS.COMPLETED,
        fileFingerprint: fp.fileFingerprint,
        rowFingerprints: fp.rowFingerprints,
        invoiceNumbers: fp.invoiceNumbers,
      }),
    ]);

    expect(parity.parity.oldResult.matchedImport?.importId).toBe('imp-exact');
    expect(parity.parity.newResult.matchedImport?.importId).toBe('imp-exact');
  });

  it('12. concurrent retry candidate set includes resumable import', async () => {
    const rows = [
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'Metro',
        productName: 'Bread',
        quantity: 2,
        saleNumber: 'INV-10',
      }),
    ];
    const fp = buildDuplicateImportFingerprints(rows);

    const parity = await runScenario('concurrent retry', rows, [
      historyRecord({
        importId: 'imp-importing',
        status: IMPORT_HISTORY_STATUS.IMPORTING,
        fileFingerprint: fp.fileFingerprint,
        rowFingerprints: fp.rowFingerprints,
        invoiceNumbers: fp.invoiceNumbers,
      }),
    ]);

    expect(parity.parity.oldResult.recommendation).toBe(DUPLICATE_IMPORT_RECOMMENDATION.BLOCK_IMPORT);
  });

  it('13. organization isolation in parity decisions', async () => {
    const rows = [
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'Metro',
        productName: 'Bread',
        quantity: 2,
        saleNumber: 'INV-10',
      }),
    ];
    const fp = buildDuplicateImportFingerprints(rows);
    const historyB = [
      historyRecord({
        importId: 'imp-b',
        fileFingerprint: fp.fileFingerprint,
        rowFingerprints: fp.rowFingerprints,
        invoiceNumbers: fp.invoiceNumbers,
      }),
    ];

    await seedHistory(ORG_B, historyB);
    await indexHistoryRecords(ORG_B, historyB);
    await finalizeIndexedHistoryForTests(ORG_B, USER, historyB);

    const parityA = await expectParity(ORG_A, reviewWithRows(rows), []);
    const parityB = await expectParity(ORG_B, reviewWithRows(rows), historyB);

    expect(parityA.oldResult.status).toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);
    expect(parityB.oldResult.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    expect(parityB.newResult.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
  });

  it('14. multiple overlapping invoices', async () => {
    const rows = [
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'A',
        productName: 'Bread',
        quantity: 1,
        saleNumber: 'INV-1',
      }),
      baseRow(3, {
        saleDate: '2026-03-01',
        customerName: 'B',
        productName: 'Puff',
        quantity: 1,
        saleNumber: 'INV-2',
      }),
      baseRow(4, {
        saleDate: '2026-03-01',
        customerName: 'C',
        productName: 'Tart',
        quantity: 1,
        saleNumber: 'INV-3',
      }),
    ];

    await runScenario('multiple overlapping invoices', rows, [
      historyRecord({
        importId: 'imp-overlap-inv',
        fileFingerprint: 'other',
        rowFingerprints: ['x'],
        invoiceNumbers: ['INV-1', 'INV-2', 'INV-3'],
        rowCount: 3,
      }),
    ]);
  });

  it('15. multiple overlapping row fingerprints', async () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
      baseRow(index + 2, {
        saleDate: '2026-03-01',
        customerName: `Store ${index}`,
        productName: 'Bread',
        quantity: 2,
        saleNumber: `INV-${index}`,
      }),
    );
    const historyFingerprints = buildDuplicateImportFingerprints(rows.slice(0, 4));

    await runScenario('multiple overlapping row fingerprints', rows, [
      historyRecord({
        importId: 'imp-overlap-rows',
        fileFingerprint: 'other',
        rowFingerprints: historyFingerprints.rowFingerprints,
        invoiceNumbers: [],
        rowCount: 4,
      }),
    ]);
  });

  it('16. large historical dataset — candidate set smaller than full history', async () => {
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
    const noiseHistory = Array.from({ length: 20 }, (_, index) =>
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

    await seedHistory(ORG_A, [...noiseHistory, target]);
    await indexHistoryRecords(ORG_A, [...noiseHistory, target]);
    await finalizeIndexedHistoryForTests(ORG_A, USER, [...noiseHistory, target]);

    const parity = await expectParity(ORG_A, reviewWithRows(rows), [...noiseHistory, target]);

    expect(parity.fullHistoryCount).toBe(21);
    expect(parity.candidateHistoryCount).toBeLessThan(parity.fullHistoryCount);
    expect(parity.oldResult.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
  });
});

describe('Phase 4B — TEST 3 partial index failure recovery (mock)', () => {
  it('repairs missing hits after a failed batch without duplicating existing hits', async () => {
    const invoiceCount = 500;
    const rowCount = 200;
    const invoiceNumbers = Array.from({ length: invoiceCount }, (_, index) => `INV-${index}`);
    const rowFingerprints = Array.from({ length: rowCount }, (_, index) => `row-${index}`);
    const importId = 'imp-partial-fail';

    harness.failBatchIndexes = [1];
    harness.current = createInMemoryFirestore(harness.failBatchIndexes);

    const failed = await importDuplicateIndexRepository.indexImportDuplicateHits(ORG_A, USER, {
      importId,
      invoiceNumbers,
      rowFingerprints,
      status: IMPORT_HISTORY_STATUS.IMPORTING,
    });

    expect(failed.success).toBe(false);
    expect(harness.current.docs.size).toBe(IMPORT_DUPLICATE_INDEX_MAX_BATCH_WRITES);

    harness.failBatchIndexes = [];

    const repaired = await importDuplicateIndexRepository.indexImportDuplicateHits(ORG_A, USER, {
      importId,
      invoiceNumbers,
      rowFingerprints,
      status: IMPORT_HISTORY_STATUS.COMPLETED,
    });

    expect(repaired.success).toBe(true);
    expect(harness.current.docs.size).toBe(invoiceCount + rowCount);
    expect(harness.current.docs.get(invoiceHitPath(ORG_A, 'INV-0', importId))).toMatchObject({
      status: IMPORT_HISTORY_STATUS.COMPLETED,
    });
    expect(harness.current.docs.get(rowHitPath(ORG_A, 'row-199', importId))).toBeDefined();
    expect(harness.current.docs.get(invoiceHitPath(ORG_A, 'INV-499', importId))).toBeDefined();
  });
});

describe('Phase 4C — fallback and empty index behavior', () => {
  beforeEach(() => {
    harness.failBatchIndexes = [];
    harness.throwOnIndexRead = false;
    harness.current = createInMemoryFirestore(harness.failBatchIndexes);
  });

  it('uses index-empty when lookup succeeds with no history', async () => {
    const rows = [
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'Corner Store',
        productName: 'Bread',
        quantity: 2,
        saleNumber: 'INV-1',
      }),
    ];

    await markOrgIndexCoverageCompleteForTests(ORG_A, USER);

    const parity = await compareDuplicateDetectionPaths(ORG_A, {
      resolvedReview: reviewWithRows(rows),
      importHistory: [],
    });

    expect(parity.matches).toBe(true);
    expect(parity.oldResult.status).toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);
    expect(parity.meta.source).toBe('index-empty');
    expect(parity.meta.indexLookupCount).toBeGreaterThan(0);
  });

  it('falls back to full history when index lookup throws', async () => {
    const rows = [
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'Metro',
        productName: 'Bread',
        quantity: 2,
        saleNumber: 'INV-10',
      }),
    ];
    const fingerprints = buildDuplicateImportFingerprints(rows);
    const history = [
      historyRecord({
        importId: 'imp-throws',
        fileFingerprint: fingerprints.fileFingerprint,
        rowFingerprints: fingerprints.rowFingerprints,
        invoiceNumbers: fingerprints.invoiceNumbers,
      }),
    ];

    await seedHistory(ORG_A, history);
    await markOrgIndexCoverageCompleteForTests(ORG_A, USER);
    harness.throwOnIndexRead = true;

    const parity = await compareDuplicateDetectionPaths(ORG_A, {
      resolvedReview: reviewWithRows(rows),
      importHistory: history,
    });

    harness.throwOnIndexRead = false;

    expect(parity.matches).toBe(true);
    expect(parity.oldResult.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    expect(parity.newResult.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    expect(parity.meta.source).toBe('fallback-error');
  });
});

describe('Phase 4D — batched index lookup parity', () => {
  beforeEach(() => {
    harness.failBatchIndexes = [];
    harness.throwOnIndexRead = false;
    harness.current = createInMemoryFirestore(harness.failBatchIndexes);
  });

  it('returns identical candidate IDs as sequential per-hash lookup', async () => {
    const rows = [
      baseRow(2, {
        saleDate: '2026-03-01',
        customerName: 'Corner Store',
        productName: 'Bread',
        quantity: 2,
        saleNumber: 'INV-BATCH-1',
      }),
      baseRow(3, {
        saleDate: '2026-03-01',
        customerName: 'Corner Store',
        productName: 'Croissant',
        quantity: 1,
        saleNumber: 'INV-BATCH-2',
      }),
    ];
    const fingerprints = buildDuplicateImportFingerprints(rows);
    const history = [
      historyRecord({
        importId: 'imp-batch-a',
        invoiceNumbers: ['INV-BATCH-1'],
        rowFingerprints: [fingerprints.rowFingerprints[0]!],
        rowCount: 1,
      }),
      historyRecord({
        importId: 'imp-batch-b',
        invoiceNumbers: ['INV-BATCH-2'],
        rowFingerprints: [fingerprints.rowFingerprints[1]!],
        rowCount: 1,
      }),
    ];

    await seedHistory(ORG_A, history);
    await indexHistoryRecords(ORG_A, history);

    const sequential = await lookupCandidateImportIdsFromIndexSequential(ORG_A, fingerprints);
    const batched = await lookupCandidateImportIdsFromIndexBatched(ORG_A, fingerprints);

    expect([...batched.candidateIds].sort()).toEqual([...sequential.candidateIds].sort());
    expect(batched.indexLookupCount).toBeLessThan(sequential.indexLookupCount);
  });
});
