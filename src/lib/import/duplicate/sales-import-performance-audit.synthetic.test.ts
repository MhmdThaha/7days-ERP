/**
 * Sales Import Performance Audit — Level 2 synthetic 100k scaling (TEST ONLY).
 *
 * Proves algorithmic behavior without writing 100k Firestore documents.
 * Run: npx vitest run src/lib/import/duplicate/sales-import-performance-audit.synthetic.test.ts
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  detectDuplicateImport,
  DUPLICATE_IMPORT_STATUS,
} from '@/lib/import/duplicate';
import {
  resolveImportHistoryForDuplicateDetection,
} from '@/lib/import/duplicate/import-duplicate-index-candidate.service';
import { markOrgIndexCoverageCompleteForTests } from '@/lib/import/duplicate/import-index-health.test-helpers';
import {
  assertSyntheticTestEnvironment,
  buildAuditReview,
  buildAuditRow,
  buildExcelRows,
  lightweightHistoryRecord,
  metaMode,
  PERFORMANCE_AUDIT_ROWS,
  recordAuditRow,
  rowFingerprintFromValues,
} from '@/lib/import/duplicate/sales-import-performance-audit.helpers';
import { hashImportIdentity } from '@/lib/repositories/import-history.repository';
import { withCollectionGroupMock } from '@/lib/import/duplicate/import-duplicate-index-collection-group.mock';

const ORG = 'org-perf-synthetic';
const USER = 'perf-audit-user';
const SYNTHETIC_HISTORY_COUNT = 100_000;

type DocMap = Map<string, Record<string, unknown>>;

/** Lazy store — 100k import IDs exist logically but are not all materialized. */
class SyntheticHistoryStore {
  readonly totalImports: number;
  listCalls = 0;
  getByIdCalls = 0;
  materializedImportIds = new Set<string>();
  private readonly targetImportId: string | null;
  private readonly targetRecord: ReturnType<typeof lightweightHistoryRecord> | null;

  constructor(totalImports: number, target?: ReturnType<typeof lightweightHistoryRecord>) {
    this.totalImports = totalImports;
    this.targetImportId = target?.importId ?? null;
    this.targetRecord = target ?? null;
  }

  buildRecord(importId: string) {
    if (this.targetRecord && importId === this.targetImportId) {
      return this.targetRecord;
    }

    const index = Number(importId.replace('imp-', '')) || 0;

    return lightweightHistoryRecord(
      importId,
      `NOISE-${index}`,
      `row-fp-${index}`,
      `file-fp-${index}`,
    );
  }

  async list(_orgId: string) {
    this.listCalls += 1;
    return Array.from({ length: this.totalImports }, (_, index) => this.buildRecord(`imp-${index}`));
  }

  async getById(_orgId: string, importId: string) {
    this.getByIdCalls += 1;
    this.materializedImportIds.add(importId);
    return {
      ...this.buildRecord(importId),
      rowsImported: 1,
      rowsSkipped: 0,
      rowsFailed: 0,
      saleIds: [],
      executionStatus: 'IMPORTED' as const,
    };
  }

  async hasAny(_orgId: string) {
    return this.totalImports > 0;
  }
}

function createInMemoryFirestore() {
  const docs: DocMap = new Map();

  function collectionAt(basePath: string) {
    return {
      doc(id: string) {
        const path = `${basePath}/${id}`;
        const docRef = {
          id,
          path,
          collection(name: string) {
            return collectionAt(`${path}/${name}`);
          },
          get: async () => ({
            exists: docs.has(path),
            id,
            data: () => docs.get(path),
          }),
          set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
            const previous = docs.get(path);
            docs.set(path, options?.merge && previous ? { ...previous, ...data } : { ...data });
          },
        };

        return docRef;
      },
      where(field: string, op: string, value: unknown) {
        return {
          limit(_count: number) {
            return this;
          },
          get: async () => {
            const matches = [...docs.entries()]
              .filter(([path, data]) => {
                const suffix = path.slice(basePath.length + 1);
                return path.startsWith(`${basePath}/`) && !suffix.includes('/') && op === '==' && data[field] === value;
              })
              .slice(0, 1);

            return {
              docs: matches.map(([path, data]) => ({
                id: path.slice(basePath.length + 1),
                data: () => data,
              })),
              empty: matches.length === 0,
            };
          },
        };
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
    collection: (name: string) => collectionAt(name),
    batch: () => {
      const ops: Array<{ path: string; data: Record<string, unknown> }> = [];
      return {
        set(ref: { path: string }, data: Record<string, unknown>, options?: { merge?: boolean }) {
          ops.push({
            path: ref.path,
            data: options?.merge ? { ...(docs.get(ref.path) ?? {}), ...data } : data,
          });
        },
        async commit() {
          for (const op of ops) {
            docs.set(op.path, op.data);
          }
        },
      };
    },
  },
    docs,
  );

  return {
    docs,
    db,
    seedIndexHit(orgId: string, importId: string, invoice: string, rowFp: string) {
      const invoiceHash = hashImportIdentity(invoice.trim().toUpperCase());
      const rowHash = hashImportIdentity(rowFp);
      docs.set(`organizations/${orgId}/importDuplicateInvoices/${invoiceHash}/hits/${importId}`, {
        importId,
        organizationId: orgId,
        invoiceHash,
      });
      docs.set(`organizations/${orgId}/importDuplicateRows/${rowHash}/hits/${importId}`, {
        importId,
        organizationId: orgId,
        fingerprintHash: rowHash,
      });
    },
  };
}

const harness = vi.hoisted(() => ({
  current: null as ReturnType<typeof createInMemoryFirestore> | null,
  store: null as SyntheticHistoryStore | null,
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

vi.mock('@/lib/repositories/import-history.repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/repositories/import-history.repository')>();
  return {
    ...actual,
    importHistoryRepository: {
      ...actual.importHistoryRepository,
      list: (orgId: string) => harness.store!.list(orgId),
      getById: (orgId: string, importId: string) => harness.store!.getById(orgId, importId),
      hasAny: (orgId: string) => harness.store!.hasAny(orgId),
    },
  };
});

describe('Level 2 — synthetic 100k performance audit', () => {
  beforeEach(() => {
    harness.current = createInMemoryFirestore();
    harness.store = new SyntheticHistoryStore(SYNTHETIC_HISTORY_COUNT);
  });

  it('environment safety — no production Firebase credentials', () => {
    assertSyntheticTestEnvironment();
  });

  it('100k synthetic / complete / 10-row new file — no full-history scan', async () => {
    const rows = buildExcelRows(10, 'AUDIT-NEW');
    await markOrgIndexCoverageCompleteForTests(ORG, USER, SYNTHETIC_HISTORY_COUNT);

    const started = performance.now();
    const resolved = await resolveImportHistoryForDuplicateDetection(ORG, buildAuditReview(rows));
    const elapsed = performance.now() - started;

    const duplicateResult = detectDuplicateImport({
      resolvedReview: buildAuditReview(rows),
      importHistory: resolved.importHistory,
    });

    expect(resolved.meta.source).toBe('index-empty');
    expect(metaMode(resolved.meta)).toBe('complete');
    expect(harness.store!.listCalls).toBe(0);
    expect(harness.store!.getByIdCalls).toBe(0);
    expect(harness.store!.materializedImportIds.size).toBe(0);
    expect(resolved.importHistory).toHaveLength(0);
    expect(duplicateResult.status).toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);
    expect(harness.current!.docs.size).toBeLessThan(20);

    recordAuditRow({
      history: '100k-synthetic',
      excelRows: 10,
      mode: 'synthetic-complete',
      indexReads: resolved.meta.indexLookupCount,
      historyReads: 0,
      candidates: resolved.meta.candidateImportIds.length,
      timeMs: Math.round(elapsed),
      listCalls: harness.store!.listCalls,
      getByIdCalls: harness.store!.getByIdCalls,
      historyDocsMaterialized: harness.store!.materializedImportIds.size,
      note: 'Algorithmic — no 100k docs in memory',
    });
  });

  it('100k synthetic / complete / known duplicate — candidate-sized materialization only', async () => {
    const targetValues = {
      saleDate: '2026-08-21',
      customerName: 'Target Store',
      productName: 'Bread',
      quantity: 3,
      saleNumber: 'DUP-TARGET-0',
    };
    const targetFp = rowFingerprintFromValues(targetValues);
    const target = lightweightHistoryRecord('imp-50000', 'DUP-TARGET-0', targetFp, 'file-target-fp');

    harness.store = new SyntheticHistoryStore(SYNTHETIC_HISTORY_COUNT, target);
    harness.current = createInMemoryFirestore();
    harness.current.seedIndexHit(ORG, 'imp-50000', 'DUP-TARGET-0', targetFp);
    await markOrgIndexCoverageCompleteForTests(ORG, USER, SYNTHETIC_HISTORY_COUNT);

    const rows = [buildAuditRow(2, targetValues)];
    const resolved = await resolveImportHistoryForDuplicateDetection(ORG, buildAuditReview(rows));

    expect(resolved.meta.source).toBe('index');
    expect(harness.store!.listCalls).toBe(0);
    expect(harness.store!.getByIdCalls).toBe(1);
    expect(harness.store!.materializedImportIds.size).toBe(1);
    expect(resolved.importHistory[0]?.importId).toBe('imp-50000');

    const duplicateResult = detectDuplicateImport({
      resolvedReview: buildAuditReview(rows),
      importHistory: resolved.importHistory,
    });
    expect(duplicateResult.status).not.toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);
    expect(duplicateResult.matchedImport?.importId).toBe('imp-50000');
  });

  it('100k synthetic / incomplete — list called once, correctness preserved', async () => {
    const targetValues = {
      saleDate: '2026-08-21',
      customerName: 'Hidden Store',
      productName: 'Bread',
      quantity: 2,
      saleNumber: 'HIDDEN-1',
    };
    const targetFp = rowFingerprintFromValues(targetValues);
    harness.store = new SyntheticHistoryStore(
      SYNTHETIC_HISTORY_COUNT,
      lightweightHistoryRecord('imp-99999', 'HIDDEN-1', targetFp, 'hidden-fp'),
    );

    const rows = [buildAuditRow(2, targetValues)];
    const resolved = await resolveImportHistoryForDuplicateDetection(ORG, buildAuditReview(rows));

    expect(resolved.meta.source).toBe('fallback-incomplete');
    expect(harness.store!.listCalls).toBe(1);

    const duplicateResult = detectDuplicateImport({
      resolvedReview: buildAuditReview(rows),
      importHistory: resolved.importHistory,
    });
    expect(duplicateResult.status).not.toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);
    expect(duplicateResult.matchedImport?.importId).toBe('imp-99999');
  });
});

afterAll(() => {
  if (PERFORMANCE_AUDIT_ROWS.length > 0) {
    // eslint-disable-next-line no-console
    console.info('\n[Synthetic performance audit rows]', PERFORMANCE_AUDIT_ROWS);
  }
});
