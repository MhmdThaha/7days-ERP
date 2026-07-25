/**
 * Commit Layer tests — protect the write contract with a mocked Firestore:
 * only valid/warning rows are written, money is converted to paise, the
 * document matches the existing ProductDocument defaults, and one failed
 * batch never crashes the run or poisons other batches.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';

import type { ValidatedRow } from '@/lib/import/engine/types';
import { commitProductImport } from '@/lib/import/services/commit.service';
import type { ImportRunReport } from '@/lib/import/services/import.service';
import { runImport } from '@/lib/import/services/import.service';
import * as XLSX from 'xlsx';

// ---------------------------------------------------------------------------
// Mocked Firestore
// ---------------------------------------------------------------------------

type CommittedDoc = { id: string; data: Record<string, unknown> };

/**
 * Minimal in-memory stand-in for the Firestore surface the commit layer
 * touches: collection().doc().collection().doc(), batch().set/commit().
 * Batches whose index is in `failBatchIndexes` reject on commit.
 */
function createFakeFirestore(failBatchIndexes: readonly number[] = []) {
  let docCounter = 0;
  let batchCounter = 0;
  const committed: CommittedDoc[] = [];
  const paths: string[] = [];

  const productsCollection = {
    doc: () => ({ id: `doc-${++docCounter}` }),
  };

  const db = {
    collection: (name: string) => {
      paths.push(name);

      return {
        doc: (orgId: string) => {
          paths.push(orgId);

          return {
            collection: (sub: string) => {
              paths.push(sub);

              return productsCollection;
            },
          };
        },
      };
    },
    batch: () => {
      const batchIndex = batchCounter++;
      const writes: CommittedDoc[] = [];

      return {
        set: (ref: { id: string }, data: Record<string, unknown>) => {
          writes.push({ id: ref.id, data });
        },
        commit: async () => {
          if (failBatchIndexes.includes(batchIndex)) {
            throw new Error('Firestore unavailable');
          }

          committed.push(...writes);
        },
      };
    },
  };

  return { db: db as unknown as Firestore, committed, paths };
}

// ---------------------------------------------------------------------------
// Report fixtures
// ---------------------------------------------------------------------------

function validatedRow(
  rowNumber: number,
  status: ValidatedRow['status'],
  values: ValidatedRow['values'],
): ValidatedRow {
  return { rowNumber, values, status, issues: [] };
}

function productReport(rows: ValidatedRow[]): ImportRunReport {
  const errorRows = rows.filter((row) => row.status === 'error').length;
  const warningRows = rows.filter((row) => row.status === 'warning').length;

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
        validRows: rows.length - errorRows - warningRows,
        warningRows,
        errorRows,
      },
    },
  };
}

const options = { orgId: 'org-1', userId: 'user-1' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('commitProductImport', () => {
  it('writes valid and warning rows, skips error rows', async () => {
    const { db, committed } = createFakeFirestore();

    const result = await commitProductImport(
      db,
      productReport([
        validatedRow(2, 'valid', { name: 'Milk Bread', sellingPrice: 45 }),
        validatedRow(3, 'error', { name: null }),
        validatedRow(4, 'warning', { name: 'Veg Puff', sellingPrice: 25 }),
      ]),
      options,
    );

    expect(result.importedCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.documentIds).toHaveLength(2);
    expect(result.commitErrors).toEqual([]);
    expect(committed).toHaveLength(2);

    // Row results stay in original spreadsheet order.
    expect(result.rowResults.map((row) => [row.rowNumber, row.status])).toEqual([
      [2, 'imported'],
      [3, 'skipped'],
      [4, 'imported'],
    ]);
  });

  it('builds documents matching the ProductDocument schema and paise convention', async () => {
    const { db, committed, paths } = createFakeFirestore();

    await commitProductImport(
      db,
      productReport([
        validatedRow(2, 'valid', {
          name: '  Chocolate Cake  ',
          code: 'cak-002',
          category: 'Cake',
          unit: 'pcs',
          sellingPrice: 1250.5,
          costPrice: 640,
          openingStock: 8,
        }),
      ]),
      options,
    );

    // Documents land in organizations/{orgId}/products.
    expect(paths).toEqual(['organizations', 'org-1', 'products']);

    const doc = committed[0]?.data;

    expect(doc).toMatchObject({
      organizationId: 'org-1',
      name: 'Chocolate Cake', // trimmed
      code: 'CAK-002', // uppercased like productRepository.create
      category: 'Cake',
      unit: 'pcs',
      sellingPrice: 125050, // ₹1,250.50 → paise
      averageCost: 64000, // ₹640 → paise
      currentStock: 8,
      description: null,
      isActive: true,
      activeRecipeId: null,
      imageUrl: null,
      createdBy: 'user-1',
      updatedBy: 'user-1',
      deletedAt: null,
      deletedBy: null,
    });
  });

  it('applies the same defaults as productRepository.create for missing fields', async () => {
    const { db, committed } = createFakeFirestore();

    await commitProductImport(
      db,
      productReport([validatedRow(2, 'valid', { name: 'Rusk Toast' })]),
      options,
    );

    expect(committed[0]?.data).toMatchObject({
      code: '',
      category: 'Other',
      unit: 'pcs',
      sellingPrice: 0,
      currentStock: 0,
      averageCost: 0,
    });
  });

  it('splits writes into multiple batches when rows exceed batchSize', async () => {
    const { db, committed } = createFakeFirestore();

    const rows = [2, 3, 4, 5, 6].map((rowNumber) =>
      validatedRow(rowNumber, 'valid', { name: `Item ${rowNumber}` }),
    );

    const result = await commitProductImport(db, productReport(rows), {
      ...options,
      batchSize: 2,
    });

    expect(result.importedCount).toBe(5);
    expect(committed).toHaveLength(5);
  });

  it('isolates a failed batch: its rows fail, other batches still commit', async () => {
    // batchSize 1 → three batches; batch index 1 (row 3) fails.
    const { db, committed } = createFakeFirestore([1]);

    const result = await commitProductImport(
      db,
      productReport([
        validatedRow(2, 'valid', { name: 'Milk Bread' }),
        validatedRow(3, 'valid', { name: 'Veg Puff' }),
        validatedRow(4, 'valid', { name: 'Rusk Toast' }),
      ]),
      { ...options, batchSize: 1 },
    );

    expect(result.importedCount).toBe(2);
    expect(result.failedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(committed).toHaveLength(2);

    expect(result.commitErrors).toEqual([
      { batchIndex: 1, rowNumbers: [3], message: 'Firestore unavailable' },
    ]);

    const failed = result.rowResults.find((row) => row.rowNumber === 3);

    expect(failed).toMatchObject({ status: 'failed', reason: 'Firestore unavailable' });
  });

  it('rejects a report for a different entity type', async () => {
    const { db } = createFakeFirestore();
    const report = {
      ...productReport([]),
      entityType: 'supplier',
    } as unknown as ImportRunReport;

    await expect(commitProductImport(db, report, options)).rejects.toThrowError(
      /only commits products/,
    );
  });

  it('commits a product whose selling price came from an Excel formula cached value', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Product Name', 'Selling Price'],
      ['Bread', null],
    ]);
    sheet['C2'] = { t: 'n', v: 40 };
    sheet['D2'] = { t: 'n', v: 5 };
    sheet['B2'] = { t: 'n', f: 'C2+D2', v: 45 };
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Items');
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;

    const report = runImport({
      data: bytes,
      fileName: 'items.xlsx',
      entityType: 'product',
      mapping: {
        columnMappings: [
          { sourceHeader: 'Product Name', targetField: 'name' },
          { sourceHeader: 'Selling Price', targetField: 'sellingPrice' },
        ],
      },
    });

    const { db, committed } = createFakeFirestore();
    const result = await commitProductImport(db, report, options);

    expect(result.importedCount).toBe(1);
    expect(committed[0]?.data).toMatchObject({
      name: 'Bread',
      sellingPrice: 4500,
    });
  });
});
