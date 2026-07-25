/**
 * Conflict resolution tests — row planning and commit orchestration
 * (creates via commitProductImport, updates via batch.update).
 */

import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NormalizedValue, ValidatedRow } from '@/lib/import/engine/types';
import {
  commitProductImportWithResolution,
  planProductImportRows,
} from '@/lib/import/services/conflict-resolution.service';
import {
  detectProductImportConflicts,
  loadProductNameIndex,
  normalizeProductName,
  SKIP_CONFLICTING_DUPLICATE_REASON,
  SKIP_EXACT_DUPLICATE_REASON,
  SKIP_EXISTING_PRODUCT_REASON,
  type ProductNameIndex,
} from '@/lib/import/services/conflict.service';
import type { ImportRunReport } from '@/lib/import/services/import.service';

vi.mock('@/lib/import/services/conflict.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/import/services/conflict.service')>();

  return {
    ...actual,
    loadProductNameIndex: vi.fn(),
  };
});

function row(
  rowNumber: number,
  values: Record<string, NormalizedValue>,
  status: ValidatedRow['status'] = 'valid',
): ValidatedRow {
  return {
    rowNumber,
    values,
    issues: [],
    status,
  };
}

function report(rows: ValidatedRow[]): ImportRunReport {
  const errorRows = rows.filter((r) => r.status === 'error').length;

  return {
    entityType: 'product',
    sheetName: 'Items',
    headers: ['Item Name'],
    skippedEmptyRowCount: 0,
    ignoredHeaders: [],
    missingSourceHeaders: [],
    missingRequiredFields: [],
    result: {
      rows,
      summary: {
        totalRows: rows.length,
        validRows: rows.length - errorRows,
        warningRows: 0,
        errorRows,
      },
    },
  };
}

function index(
  entries: Record<string, { id: string; name: string; code: string }>,
): ProductNameIndex {
  return new Map(
    Object.entries(entries).map(([key, value]) => [normalizeProductName(key), value]),
  );
}

function conflictsFor(reportRows: ValidatedRow[], existing: ProductNameIndex = new Map()) {
  return detectProductImportConflicts(report(reportRows), existing);
}

const garlic = (rowNumber: number, sellingPrice = 65) =>
  row(rowNumber, { name: 'Garlic Bread', code: 'GB001', sellingPrice });

type StoredDoc = { id: string; data: Record<string, unknown> };

function createFakeFirestore(failBatchIndexes: readonly number[] = []) {
  let docCounter = 0;
  let batchCounter = 0;
  const created: StoredDoc[] = [];
  const updated: { id: string; data: Record<string, unknown> }[] = [];
  const existingDocs = new Map<string, StoredDoc>();

  function productsCollection() {
    return {
      doc: (id?: string) => {
        if (id) {
          return { id };
        }

        return { id: `doc-${++docCounter}` };
      },
    };
  }

  const store = {
    seedExisting(id: string, data: Record<string, unknown>) {
      existingDocs.set(id, { id, data });
    },
    collection: () => ({
      doc: () => ({
        collection: () => productsCollection(),
      }),
    }),
    batch: () => {
      const batchIndex = batchCounter++;
      const pendingCreates: StoredDoc[] = [];
      const pendingUpdates: { id: string; data: Record<string, unknown> }[] = [];

      return {
        set: (ref: { id: string }, data: Record<string, unknown>) => {
          pendingCreates.push({ id: ref.id, data });
        },
        update: (ref: { id: string }, data: Record<string, unknown>) => {
          pendingUpdates.push({ id: ref.id, data });
        },
        commit: async () => {
          if (failBatchIndexes.includes(batchIndex)) {
            throw new Error('Firestore unavailable');
          }

          created.push(...pendingCreates);

          for (const entry of pendingUpdates) {
            updated.push(entry);
            const prev = existingDocs.get(entry.id)?.data ?? {};
            existingDocs.set(entry.id, { id: entry.id, data: { ...prev, ...entry.data } });
          }
        },
      };
    },
    created,
    updated,
    existingDocs,
  };

  return { db: store as unknown as Firestore, store };
}

describe('planProductImportRows', () => {
  it('new-only: creates clean rows and skips conflicting duplicates and existing', () => {
    const rows = [
      row(2, { name: 'Milk Bread', sellingPrice: 45 }),
      row(3, { name: 'Big Bread', sellingPrice: 45 }),
      row(4, { name: 'Big Bread', sellingPrice: 50 }),
      row(5, { name: 'Tea Bun', sellingPrice: 20 }),
    ];
    const existing = index({ 'tea bun': { id: 'p9', name: 'Tea Bun', code: 'TB-1' } });
    const conflicts = conflictsFor(rows, existing);

    const plans = planProductImportRows(report(rows), conflicts, 'new-only', existing);

    expect(plans.filter((p) => p.action === 'create').map((p) => p.row.rowNumber)).toEqual([
      2,
    ]);
    expect(plans.find((p) => p.row.rowNumber === 3)).toMatchObject({
      action: 'skip',
      reason: SKIP_CONFLICTING_DUPLICATE_REASON,
    });
    expect(plans.find((p) => p.row.rowNumber === 5)).toMatchObject({
      action: 'skip',
      reason: SKIP_EXISTING_PRODUCT_REASON,
    });
  });

  it('new-only: imports the first exact duplicate and skips the rest', () => {
    const rows = [garlic(2), garlic(3), row(4, { name: 'Tea Bun', sellingPrice: 20 })];
    const conflicts = conflictsFor(rows);

    const plans = planProductImportRows(report(rows), conflicts, 'new-only');

    expect(plans.filter((p) => p.action === 'create').map((p) => p.row.rowNumber)).toEqual([
      2,
      4,
    ]);
    expect(plans.find((p) => p.row.rowNumber === 3)).toMatchObject({
      action: 'skip',
      reason: SKIP_EXACT_DUPLICATE_REASON,
    });
  });

  it('update-existing: creates new names and updates existing once each', () => {
    const rows = [
      row(2, { name: 'Milk Bread', sellingPrice: 45 }),
      row(3, { name: 'Big Bread', sellingPrice: 45 }),
      row(4, { name: 'Big Bread', sellingPrice: 50 }),
      row(5, { name: 'Tea Bun', sellingPrice: 20 }),
    ];
    const existing = index({ 'tea bun': { id: 'p9', name: 'Tea Bun', code: 'TB-1' } });
    const conflicts = conflictsFor(rows, existing);

    const plans = planProductImportRows(
      report(rows),
      conflicts,
      'update-existing',
      existing,
    );

    expect(plans.find((p) => p.row.rowNumber === 2)).toMatchObject({ action: 'create' });
    expect(plans.find((p) => p.row.rowNumber === 3)).toMatchObject({
      action: 'skip',
      reason: SKIP_CONFLICTING_DUPLICATE_REASON,
    });
    expect(plans.find((p) => p.row.rowNumber === 5)).toMatchObject({
      action: 'update',
      productId: 'p9',
    });
  });

  it('update-existing: treats identical rows as exact duplicates (first row wins)', () => {
    const rows = [garlic(2), garlic(3)];
    const existing = index({
      'milk bread': { id: 'p1', name: 'Milk Bread', code: 'MB-1' },
    });
    const conflicts = conflictsFor(rows, existing);

    const plans = planProductImportRows(
      report(rows),
      conflicts,
      'update-existing',
      existing,
    );

    expect(plans[0]).toMatchObject({ action: 'create' });
    expect(plans[1]).toMatchObject({
      action: 'skip',
      reason: SKIP_EXACT_DUPLICATE_REASON,
    });
  });
});

describe('commitProductImportWithResolution', () => {
  const options = { orgId: 'org-1', userId: 'user-1' };

  beforeEach(() => {
    vi.mocked(loadProductNameIndex).mockReset();
  });

  it('imports one Garlic Bread and skips one exact duplicate', async () => {
    const rows = [garlic(2), garlic(3)];
    const conflicts = conflictsFor(rows);
    const { db, store } = createFakeFirestore();

    const result = await commitProductImportWithResolution(
      db,
      report(rows),
      conflicts,
      'new-only',
      options,
    );

    expect(result.importedCount).toBe(1);
    expect(result.skippedExactDuplicateCount).toBe(1);
    expect(store.created).toHaveLength(1);
    expect(store.created[0]?.data).toMatchObject({ name: 'Garlic Bread', code: 'GB001' });
  });

  it('imports first of three identical rows and skips two exact duplicates', async () => {
    const rows = [garlic(2), garlic(3), garlic(4)];
    const conflicts = conflictsFor(rows);
    const { db, store } = createFakeFirestore();

    const result = await commitProductImportWithResolution(
      db,
      report(rows),
      conflicts,
      'new-only',
      options,
    );

    expect(result.importedCount).toBe(1);
    expect(result.skippedExactDuplicateCount).toBe(2);
    expect(store.created).toHaveLength(1);
  });

  it('new-only: commits only clean products when conflicting duplicates exist', async () => {
    const rows = [
      row(2, { name: 'Milk Bread', sellingPrice: 45 }),
      row(3, { name: 'Big Bread', sellingPrice: 45 }),
      row(4, { name: 'Big Bread', sellingPrice: 50 }),
    ];
    const conflicts = conflictsFor(rows);
    const { db, store } = createFakeFirestore();

    const result = await commitProductImportWithResolution(
      db,
      report(rows),
      conflicts,
      'new-only',
      options,
    );

    expect(result.importedCount).toBe(1);
    expect(store.created).toHaveLength(1);
    expect(store.created[0]?.data).toMatchObject({ name: 'Milk Bread' });
    expect(result.rowResults.find((r) => r.rowNumber === 4)?.status).toBe('skipped');
  });

  it('update-existing: creates new and updates existing in a mixed file', async () => {
    const rows = [
      row(2, { name: 'Milk Bread', sellingPrice: 45 }),
      row(3, { name: 'Big Bread', sellingPrice: 45 }),
      row(4, { name: 'Big Bread', sellingPrice: 50 }),
      row(5, { name: 'Tea Bun', sellingPrice: 20 }),
    ];
    const existing = index({ 'tea bun': { id: 'p9', name: 'Tea Bun', code: 'TB-1' } });
    const conflicts = conflictsFor(rows, existing);
    const { db, store } = createFakeFirestore();

    vi.mocked(loadProductNameIndex).mockResolvedValue(existing);

    store.seedExisting('p9', {
      organizationId: 'org-1',
      name: 'Tea Bun',
      code: 'TB-1',
      sellingPrice: 1000,
    });

    const result = await commitProductImportWithResolution(
      db,
      report(rows),
      conflicts,
      'update-existing',
      options,
    );

    expect(result.importedCount).toBe(1);
    expect(result.updatedCount).toBe(1);
    expect(store.created.map((d) => d.data['name'])).toEqual(['Milk Bread']);
    expect(store.updated[0]?.id).toBe('p9');
  });

  it('skips all rows when duplicate product codes block the import', () => {
    const rows = [
      row(2, { name: 'Garlic Bread', code: 'BB001', sellingPrice: 65 }),
      row(5, { name: 'Big Bread', code: 'BB001', sellingPrice: 70 }),
    ];
    const conflicts = conflictsFor(rows);

    const plans = planProductImportRows(report(rows), conflicts, 'new-only');

    expect(plans.every((plan) => plan.action === 'skip')).toBe(true);
    expect(
      plans.some(
        (plan) =>
          plan.action === 'skip' &&
          'reason' in plan &&
          plan.reason.includes('Duplicate product code'),
      ),
    ).toBe(true);
  });

  it('skips existing products with the existing skip counter', async () => {
    const rows = [
      row(2, { name: 'Tea Bun', sellingPrice: 20 }),
      row(3, { name: 'Milk Bread', sellingPrice: 45 }),
    ];
    const existing = index({ 'tea bun': { id: 'p9', name: 'Tea Bun', code: 'TB-1' } });
    const conflicts = conflictsFor(rows, existing);
    const { db, store } = createFakeFirestore();

    const result = await commitProductImportWithResolution(
      db,
      report(rows),
      conflicts,
      'new-only',
      options,
    );

    expect(result.importedCount).toBe(1);
    expect(result.skippedExistingCount).toBe(1);
    expect(store.created).toHaveLength(1);
  });
});
