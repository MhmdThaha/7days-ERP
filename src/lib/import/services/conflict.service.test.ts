/**
 * Conflict Detection tests — exact vs conflicting duplicates, existing
 * products, mixed conflicts, and trim/case-insensitive matching.
 */

import { describe, expect, it } from 'vitest';

import type { NormalizedValue, ValidatedRow } from '@/lib/import/engine/types';
import {
  areRowsExactDuplicates,
  detectProductImportConflicts,
  normalizeProductCode,
  normalizeProductName,
  rowImportFingerprint,
  type ProductCodeIndex,
  type ProductNameIndex,
} from '@/lib/import/services/conflict.service';
import type { ImportRunReport } from '@/lib/import/services/import.service';

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
  const warningRows = rows.filter((r) => r.status === 'warning').length;

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

function index(
  entries: Record<string, { id: string; name: string; code: string }>,
): ProductNameIndex {
  return new Map(
    Object.entries(entries).map(([key, value]) => [normalizeProductName(key), value]),
  );
}

function codeIndex(
  entries: Record<string, { id: string; name: string; code: string }>,
): ProductCodeIndex {
  return new Map(
    Object.entries(entries).map(([key, value]) => [normalizeProductCode(key), value]),
  );
}

const garlic = (rowNumber: number) =>
  row(rowNumber, { name: 'Garlic Bread', code: 'GB001', sellingPrice: 65 });

describe('rowImportFingerprint', () => {
  it('treats rows with identical importable fields as exact duplicates', () => {
    expect(areRowsExactDuplicates([garlic(2), garlic(3)])).toBe(true);
    expect(rowImportFingerprint(garlic(2))).toBe(rowImportFingerprint(garlic(3)));
  });

  it('detects conflicting duplicates when selling price differs', () => {
    expect(
      areRowsExactDuplicates([
        garlic(2),
        row(3, { name: 'Garlic Bread', code: 'GB001', sellingPrice: 70 }),
      ]),
    ).toBe(false);
  });

  it('detects conflicting duplicates when product code differs', () => {
    expect(
      areRowsExactDuplicates([
        garlic(2),
        row(3, { name: 'Garlic Bread', code: 'GB002', sellingPrice: 65 }),
      ]),
    ).toBe(false);
  });

  it('detects conflicting duplicates when category differs', () => {
    expect(
      areRowsExactDuplicates([
        row(2, { name: 'Garlic Bread', category: 'Bread', sellingPrice: 65 }),
        row(3, { name: 'Garlic Bread', category: 'Savory', sellingPrice: 65 }),
      ]),
    ).toBe(false);
  });

  it('detects conflicting duplicates when unit differs', () => {
    expect(
      areRowsExactDuplicates([
        row(2, { name: 'Garlic Bread', unit: 'pcs', sellingPrice: 65 }),
        row(3, { name: 'Garlic Bread', unit: 'kg', sellingPrice: 65 }),
      ]),
    ).toBe(false);
  });

  it('detects conflicting duplicates when opening stock differs', () => {
    expect(
      areRowsExactDuplicates([
        row(2, { name: 'Garlic Bread', openingStock: 10, sellingPrice: 65 }),
        row(3, { name: 'Garlic Bread', openingStock: 20, sellingPrice: 65 }),
      ]),
    ).toBe(false);
  });
});

describe('detectProductImportConflicts', () => {
  it('returns no conflicts when every name is unique and new', () => {
    const result = detectProductImportConflicts(
      report([
        row(2, { name: 'Milk Bread' }),
        row(3, { name: 'Veg Puff' }),
        row(4, { name: 'Rusk Toast' }),
      ]),
    );

    expect(result.duplicateRowsInFile).toEqual([]);
    expect(result.exactDuplicateRows).toEqual([]);
    expect(result.duplicateProductCodes).toEqual([]);
    expect(result.existingProducts).toEqual([]);
    expect(result.cleanRows).toEqual([2, 3, 4]);
    expect(result.summary.duplicateProductCodeCount).toBe(0);
    expect(result.summary.exactDuplicateRowCount).toBe(0);
    expect(result.summary.conflictingDuplicateRowCount).toBe(0);
    expect(result.summary.cleanRowCount).toBe(3);
  });

  it('treats two identical Garlic Bread rows as exact duplicates', () => {
    const result = detectProductImportConflicts(report([garlic(2), garlic(3)]));

    expect(result.duplicateRowsInFile).toEqual([]);
    expect(result.exactDuplicateRows).toEqual([
      {
        rowNumber: 3,
        name: 'Garlic Bread',
        normalizedName: 'garlic bread',
        keptRowNumber: 2,
      },
    ]);
    expect(result.cleanRows).toEqual([2]);
    expect(result.summary.exactDuplicateRowCount).toBe(1);
    expect(result.summary.conflictingDuplicateRowCount).toBe(0);
  });

  it('keeps the first of three identical rows and skips the other two', () => {
    const result = detectProductImportConflicts(
      report([garlic(2), garlic(3), garlic(4)]),
    );

    expect(result.cleanRows).toEqual([2]);
    expect(result.exactDuplicateRows.map((entry) => entry.rowNumber)).toEqual([3, 4]);
    expect(result.summary.exactDuplicateRowCount).toBe(2);
  });

  it('flags same name with different selling price as conflicting duplicates', () => {
    const result = detectProductImportConflicts(
      report([
        garlic(2),
        row(3, { name: 'Garlic Bread', code: 'GB001', sellingPrice: 70 }),
      ]),
    );

    expect(result.exactDuplicateRows).toEqual([]);
    expect(result.duplicateRowsInFile).toHaveLength(2);
    expect(result.cleanRows).toEqual([]);
    expect(result.summary.conflictingDuplicateRowCount).toBe(2);
  });

  it('flags rows with only the same name and no other fields as exact duplicates', () => {
    const result = detectProductImportConflicts(
      report([
        row(2, { name: 'Big Bread' }),
        row(3, { name: 'Tea Bun' }),
        row(4, { name: 'Big Bread' }),
        row(5, { name: 'Cookie' }),
      ]),
    );

    expect(result.summary.conflictingDuplicateRowCount).toBe(0);
    expect(result.summary.exactDuplicateRowCount).toBe(1);
    expect(result.cleanRows).toEqual([2, 3, 5]);
    expect(result.exactDuplicateRows[0]?.rowNumber).toBe(4);
  });

  it('flags rows whose names already exist in Firestore on the canonical row only', () => {
    const existing = index({
      'milk bread': { id: 'prod-1', name: 'Milk Bread', code: 'BRD-001' },
    });

    const result = detectProductImportConflicts(
      report([row(2, { name: 'Milk Bread' }), row(3, { name: 'Veg Puff' })]),
      existing,
    );

    expect(result.existingProducts).toEqual([
      {
        rowNumber: 2,
        name: 'Milk Bread',
        normalizedName: 'milk bread',
        existingProduct: { id: 'prod-1', name: 'Milk Bread', code: 'BRD-001' },
      },
    ]);
    expect(result.cleanRows).toEqual([3]);
  });

  it('reports mixed exact duplicates, conflicting duplicates, and existing products', () => {
    const existing = index({
      'tea bun': { id: 'prod-9', name: 'Tea Bun', code: 'BN-1' },
    });

    const result = detectProductImportConflicts(
      report([
        row(2, { name: 'Big Bread', sellingPrice: 45 }),
        row(3, { name: 'Tea Bun', sellingPrice: 20 }),
        row(4, { name: 'Big Bread', sellingPrice: 50 }),
        row(5, { name: 'Big Bread', sellingPrice: 45 }),
        row(6, { name: 'Cookie', sellingPrice: 10 }),
      ]),
      existing,
    );

    expect(result.summary.conflictingDuplicateRowCount).toBe(3);
    expect(result.summary.exactDuplicateRowCount).toBe(0);
    expect(result.summary.existingProductCount).toBe(1);
    expect(result.cleanRows).toEqual([6]);
    expect(result.exactDuplicateRows).toEqual([]);
  });

  it('treats trimmed and mixed-case identical rows as exact duplicates', () => {
    const result = detectProductImportConflicts(
      report([
        row(2, { name: 'Big Bread', sellingPrice: 45 }),
        row(3, { name: '  Big Bread  ', sellingPrice: 45 }),
      ]),
    );

    expect(result.summary.exactDuplicateRowCount).toBe(1);
    expect(result.summary.conflictingDuplicateRowCount).toBe(0);
    expect(result.cleanRows).toEqual([2]);
  });

  describe('invisible whitespace in product names', () => {
    function expectExactDuplicatePair(nameA: string, nameB: string) {
      const result = detectProductImportConflicts(
        report([
          row(2, { name: nameA, sellingPrice: 45 }),
          row(3, { name: nameB, sellingPrice: 45 }),
        ]),
      );

      expect(normalizeProductName(nameA)).toBe(normalizeProductName(nameB));
      expect(result.summary.exactDuplicateRowCount).toBe(1);
      expect(result.summary.conflictingDuplicateRowCount).toBe(0);
      expect(result.cleanRows).toEqual([2]);
      expect(result.exactDuplicateRows).toEqual([
        {
          rowNumber: 3,
          name: nameB.trim(),
          normalizedName: 'bread',
          keptRowNumber: 2,
        },
      ]);
      expect(result.duplicateRowsInFile).toEqual([]);
    }

    it.each([
      ['Bread', 'Bread '],
      ['Bread\t', 'Bread'],
      ['Bread   ', 'Bread'],
      [' Bread', 'Bread'],
      ['Bread ', 'Bread'],
    ])('treats whitespace variants as one product (%#)', (nameA, nameB) => {
      expectExactDuplicatePair(nameA, nameB);
    });
  });

  it('marks all case variants as exact duplicates when other fields match and checks existing once', () => {
    const existing = index({
      'milk bread': { id: 'prod-1', name: 'Milk Bread', code: 'BRD-001' },
    });

    const result = detectProductImportConflicts(
      report([
        row(2, { name: 'MILK BREAD', sellingPrice: 45 }),
        row(3, { name: 'milk bread', sellingPrice: 45 }),
        row(4, { name: 'Milk Bread', sellingPrice: 45 }),
      ]),
      existing,
    );

    expect(result.summary.exactDuplicateRowCount).toBe(2);
    expect(result.summary.conflictingDuplicateRowCount).toBe(0);
    expect(result.summary.existingProductCount).toBe(1);
    expect(result.existingProducts[0]?.rowNumber).toBe(2);
    expect(result.cleanRows).toEqual([]);
  });

  it('ignores error rows and rows without a product name', () => {
    const result = detectProductImportConflicts(
      report([
        row(2, { name: 'Milk Bread' }, 'valid'),
        row(3, { name: null }, 'error'),
        row(4, { name: 'Milk Bread' }, 'error'),
        row(5, { name: 'Veg Puff' }, 'warning'),
      ]),
    );

    expect(result.summary.totalChecked).toBe(2);
    expect(result.duplicateRowsInFile).toEqual([]);
    expect(result.cleanRows).toEqual([2, 5]);
  });

  it('counts existing products on canonical rows when exact duplicates also exist in Firestore', () => {
    const existing = index({
      'garlic bread': { id: 'p1', name: 'Garlic Bread', code: 'GB-1' },
      'milk bread': { id: 'p2', name: 'Milk Bread', code: 'MB-1' },
    });

    const result = detectProductImportConflicts(
      report([
        garlic(2),
        garlic(3),
        row(4, { name: 'Milk Bread', code: 'MB-1', sellingPrice: 45 }),
        row(5, { name: 'Milk Bread', code: 'MB-1', sellingPrice: 45 }),
        row(6, { name: 'Tea Bun', sellingPrice: 25 }),
      ]),
      existing,
    );

    expect(result.summary.existingProductCount).toBe(2);
    expect(result.summary.existingProductNameCount).toBe(2);
    expect(result.summary.exactDuplicateRowCount).toBe(2);
    expect(result.summary.conflictingDuplicateRowCount).toBe(0);
    expect(result.summary.cleanRowCount).toBe(1);
  });

  it('maintains cleanRowCount + unique blocking rows = totalChecked', () => {
    const existing = index({
      'milk bread': { id: 'prod-1', name: 'Milk Bread', code: 'BRD-001' },
    });

    const result = detectProductImportConflicts(
      report([
        row(2, { name: 'MILK BREAD', sellingPrice: 45 }),
        row(3, { name: 'milk bread', sellingPrice: 45 }),
        row(4, { name: 'Milk Bread', sellingPrice: 50 }),
        row(5, { name: 'Veg Puff', sellingPrice: 25 }),
      ]),
      existing,
    );

    const blockingRows = new Set([
      ...result.duplicateRowsInFile.map((entry) => entry.rowNumber),
      ...result.existingProducts.map((entry) => entry.rowNumber),
    ]);

    expect(result.summary.cleanRowCount + blockingRows.size).toBe(
      result.summary.totalChecked,
    );
  });

  it('rejects non-product reports', () => {
    const bad = {
      ...report([row(2, { name: 'Acme Supplies' })]),
      entityType: 'supplier',
    } as unknown as ImportRunReport;

    expect(() => detectProductImportConflicts(bad)).toThrowError(/only analyzes products/);
  });

  it('flags duplicate product codes inside the uploaded file', () => {
    const result = detectProductImportConflicts(
      report([
        row(2, { name: 'Garlic Bread', code: 'BB001', sellingPrice: 65 }),
        row(3, { name: 'Tea Bun', code: 'TB001', sellingPrice: 20 }),
        row(5, { name: 'Big Bread', code: 'BB001', sellingPrice: 70 }),
      ]),
    );

    expect(result.duplicateProductCodes).toEqual([
      {
        code: 'BB001',
        normalizedCode: 'BB001',
        rowNumbers: [2, 5],
      },
    ]);
    expect(result.summary.duplicateProductCodeCount).toBe(1);
    expect(result.cleanRows).toEqual([]);
  });

  it('does not flag exact-duplicate rows that share the same code', () => {
    const result = detectProductImportConflicts(
      report([
        row(2, { name: 'Garlic Bread', code: 'GB001', sellingPrice: 65 }),
        row(3, { name: 'Garlic Bread', code: 'GB001', sellingPrice: 65 }),
      ]),
    );

    expect(result.duplicateProductCodes).toEqual([]);
    expect(result.summary.exactDuplicateRowCount).toBe(1);
    expect(result.cleanRows).toEqual([2]);
  });

  it('flags product codes that already exist on a different BakeryOS product', () => {
    const existing = index({
      'milk bread': { id: 'p1', name: 'Milk Bread', code: 'BRD-001' },
    });
    const codes = codeIndex({
      'BRD-001': { id: 'p1', name: 'Milk Bread', code: 'BRD-001' },
    });

    const result = detectProductImportConflicts(
      report([row(2, { name: 'New Bun', code: 'BRD-001', sellingPrice: 25 })]),
      existing,
      codes,
    );

    expect(result.duplicateProductCodes).toEqual([
      {
        code: 'BRD-001',
        normalizedCode: 'BRD-001',
        rowNumbers: [2],
        existingProduct: { id: 'p1', name: 'Milk Bread', code: 'BRD-001' },
      },
    ]);
    expect(result.cleanRows).toEqual([]);
  });

  it('allows the same code when updating the matching existing product by name', () => {
    const existing = index({
      'milk bread': { id: 'p1', name: 'Milk Bread', code: 'BRD-001' },
    });
    const codes = codeIndex({
      'BRD-001': { id: 'p1', name: 'Milk Bread', code: 'BRD-001' },
    });

    const result = detectProductImportConflicts(
      report([row(2, { name: 'Milk Bread', code: 'BRD-001', sellingPrice: 45 })]),
      existing,
      codes,
    );

    expect(result.duplicateProductCodes).toEqual([]);
    expect(result.existingProducts).toHaveLength(1);
  });

  it('normalizes product codes case-insensitively for duplicate detection', () => {
    const result = detectProductImportConflicts(
      report([
        row(2, { name: 'Garlic Bread', code: 'bb001', sellingPrice: 65 }),
        row(5, { name: 'Big Bread', code: 'BB001', sellingPrice: 70 }),
      ]),
    );

    expect(result.duplicateProductCodes[0]?.code).toBe('BB001');
    expect(result.duplicateProductCodes[0]?.rowNumbers).toEqual([2, 5]);
  });
});
