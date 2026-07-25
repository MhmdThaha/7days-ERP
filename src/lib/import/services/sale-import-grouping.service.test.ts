/**
 * Sale Import Grouping tests.
 */

import { describe, expect, it } from 'vitest';

import { SALE_ISSUE_CODES } from '@/lib/import/definitions/sale.definition';
import type { NormalizedValue, ValidatedRow, ValidationIssue } from '@/lib/import/engine/types';
import {
  buildSaleImportGroupKey,
  groupSaleImportRows,
  normalizeSaleDateValue,
  normalizeSaleNumberValue,
  SALE_GROUP_ISSUE_CODES,
  saleImportHeaderValuesConflict,
} from '@/lib/import/services/sale-import-grouping.service';

function row(
  rowNumber: number,
  values: Record<string, NormalizedValue>,
  options: {
    status?: ValidatedRow['status'];
    issues?: ValidationIssue[];
  } = {},
): ValidatedRow {
  return {
    rowNumber,
    values,
    status: options.status ?? 'valid',
    issues: options.issues ?? [],
  };
}

describe('normalizeSaleNumberValue', () => {
  it('trims and uppercases sale numbers', () => {
    expect(normalizeSaleNumberValue(' sal-001 ')).toBe('SAL-001');
  });

  it('returns null for empty values', () => {
    expect(normalizeSaleNumberValue(null)).toBeNull();
    expect(normalizeSaleNumberValue('   ')).toBeNull();
  });
});

describe('normalizeSaleDateValue', () => {
  it('formats Date values as YYYY-MM-DD', () => {
    expect(normalizeSaleDateValue(new Date('2026-03-15T12:00:00.000Z'))).toBe('2026-03-15');
  });

  it('trims string dates', () => {
    expect(normalizeSaleDateValue(' 2026-03-15 ')).toBe('2026-03-15');
  });
});

describe('buildSaleImportGroupKey', () => {
  it('uses normalized sale number when present', () => {
    const key = buildSaleImportGroupKey(
      row(2, {
        saleNumber: ' sal-10 ',
        saleDate: '2026-03-15',
        customerName: 'Alice',
        productName: 'Bread',
        quantity: 1,
      }),
    );

    expect(key).toBe('number:SAL-10');
  });

  it('falls back to sale date and customer when sale number is missing', () => {
    const key = buildSaleImportGroupKey(
      row(2, {
        saleDate: '2026-03-15',
        customerName: ' Alice ',
        productName: 'Bread',
        quantity: 1,
      }),
    );

    expect(key).toBe('fallback:2026-03-15|alice');
  });

  it('uses empty segments when fallback fields are missing', () => {
    expect(
      buildSaleImportGroupKey(row(2, { productName: 'Bread', quantity: 1 })),
    ).toBe('fallback:|');
  });
});

describe('groupSaleImportRows', () => {
  it('returns an empty array for no rows', () => {
    expect(groupSaleImportRows([])).toEqual([]);
  });

  it('creates one group for a single row', () => {
    const source = row(5, {
      saleNumber: 'SAL-001',
      saleDate: '2026-03-15',
      customerName: 'Corner Store',
      productName: 'Milk Bread',
      quantity: 2,
      sellingPrice: 45,
      notes: 'Morning delivery',
    });

    const [group] = groupSaleImportRows([source]);

    expect(group).toEqual({
      groupKey: 'number:SAL-001',
      rowNumbers: [5],
      header: {
        saleNumber: 'SAL-001',
        normalizedSaleNumber: 'SAL-001',
        saleDate: '2026-03-15',
        customerName: 'Corner Store',
        notes: 'Morning delivery',
      },
      lines: [
        {
          rowNumber: 5,
          values: source.values,
          issues: [],
          status: 'valid',
        },
      ],
      groupIssues: [],
    });
  });

  it('merges multiple rows with the same sale number regardless of casing', () => {
    const groups = groupSaleImportRows([
      row(2, {
        saleNumber: 'sal-100',
        saleDate: '2026-03-15',
        customerName: 'Alice',
        productName: 'Bread',
        quantity: 1,
      }),
      row(4, {
        saleNumber: 'SAL-100',
        saleDate: '2026-03-15',
        customerName: 'Alice',
        productName: 'Cake',
        quantity: 3,
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.groupKey).toBe('number:SAL-100');
    expect(groups[0]?.rowNumbers).toEqual([2, 4]);
    expect(groups[0]?.lines).toHaveLength(2);
    expect(groups[0]?.lines[0]?.values.productName).toBe('Bread');
    expect(groups[0]?.lines[1]?.values.productName).toBe('Cake');
  });

  it('groups rows without sale numbers by date and customer', () => {
    const groups = groupSaleImportRows([
      row(2, {
        saleDate: '2026-03-15',
        customerName: 'Alice',
        productName: 'Bread',
        quantity: 1,
      }),
      row(3, {
        saleDate: '2026-03-15',
        customerName: 'Alice',
        productName: 'Cake',
        quantity: 2,
      }),
      row(4, {
        saleDate: '2026-03-15',
        customerName: 'Bob',
        productName: 'Rusk',
        quantity: 1,
      }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.groupKey).toBe('fallback:2026-03-15|alice');
    expect(groups[0]?.rowNumbers).toEqual([2, 3]);
    expect(groups[1]?.groupKey).toBe('fallback:2026-03-15|bob');
    expect(groups[1]?.rowNumbers).toEqual([4]);
  });

  it('keeps separate groups for different sale numbers even on the same date', () => {
    const groups = groupSaleImportRows([
      row(2, {
        saleNumber: 'SAL-001',
        saleDate: '2026-03-15',
        productName: 'Bread',
        quantity: 1,
      }),
      row(3, {
        saleNumber: 'SAL-002',
        saleDate: '2026-03-15',
        productName: 'Cake',
        quantity: 1,
      }),
    ]);

    expect(groups.map((group) => group.groupKey)).toEqual(['number:SAL-001', 'number:SAL-002']);
  });

  it('preserves line-level validation issues and status', () => {
    const warningIssue: ValidationIssue = {
      severity: 'warning',
      code: 'TEST_WARNING',
      message: 'Minor issue',
      field: 'sellingPrice',
    };
    const errorIssue: ValidationIssue = {
      severity: 'error',
      code: SALE_ISSUE_CODES.PRODUCT_REFERENCE_REQUIRED,
      message: 'Missing product',
      field: 'productName',
    };

    const groups = groupSaleImportRows([
      row(
        2,
        {
          saleNumber: 'SAL-1',
          saleDate: '2026-03-15',
          productName: 'Bread',
          quantity: 1,
        },
        { status: 'warning', issues: [warningIssue] },
      ),
      row(
        3,
        {
          saleNumber: 'SAL-1',
          saleDate: '2026-03-15',
          quantity: 2,
        },
        { status: 'error', issues: [errorIssue] },
      ),
    ]);

    expect(groups[0]?.lines[0]?.issues).toEqual([warningIssue]);
    expect(groups[0]?.lines[0]?.status).toBe('warning');
    expect(groups[0]?.lines[1]?.issues).toEqual([errorIssue]);
    expect(groups[0]?.lines[1]?.status).toBe('error');
  });

  it('uses the earliest spreadsheet row as the group header', () => {
    const groups = groupSaleImportRows([
      row(4, {
        saleNumber: 'SAL-9',
        saleDate: '2026-03-16',
        customerName: 'Late Row',
        notes: 'Second',
        productName: 'Cake',
        quantity: 1,
      }),
      row(2, {
        saleNumber: 'SAL-9',
        saleDate: '2026-03-15',
        customerName: 'First Row',
        notes: 'First',
        productName: 'Bread',
        quantity: 1,
      }),
    ]);

    expect(groups[0]?.header.saleDate).toBe('2026-03-15');
    expect(groups[0]?.header.customerName).toBe('First Row');
    expect(groups[0]?.header.notes).toBe('First');
    expect(groups[0]?.rowNumbers).toEqual([2, 4]);
    expect(groups[0]?.lines.map((line) => line.rowNumber)).toEqual([2, 4]);
  });

  it('emits group issues when header fields conflict within a sale number group', () => {
    const groups = groupSaleImportRows([
      row(2, {
        saleNumber: 'SAL-50',
        saleDate: '2026-03-15',
        customerName: 'Alice',
        productName: 'Bread',
        quantity: 1,
      }),
      row(3, {
        saleNumber: 'SAL-50',
        saleDate: '2026-03-16',
        customerName: 'Bob',
        productName: 'Cake',
        quantity: 1,
      }),
    ]);

    expect(groups[0]?.groupIssues).toEqual([
      expect.objectContaining({
        code: SALE_GROUP_ISSUE_CODES.CONFLICTING_SALE_DATE,
        field: 'saleDate',
      }),
      expect.objectContaining({
        code: SALE_GROUP_ISSUE_CODES.CONFLICTING_CUSTOMER_NAME,
        field: 'customerName',
      }),
    ]);
  });

  it('does not emit group issues when later rows leave header fields empty', () => {
    const groups = groupSaleImportRows([
      row(2, {
        saleNumber: 'SAL-50',
        saleDate: '2026-03-15',
        customerName: 'Alice',
        productName: 'Bread',
        quantity: 1,
      }),
      row(3, {
        saleNumber: 'SAL-50',
        productName: 'Cake',
        quantity: 1,
      }),
    ]);

    expect(groups[0]?.groupIssues).toEqual([]);
  });

  it('orders output groups by first row number', () => {
    const groups = groupSaleImportRows([
      row(10, {
        saleNumber: 'SAL-B',
        saleDate: '2026-03-15',
        productName: 'Cake',
        quantity: 1,
      }),
      row(2, {
        saleNumber: 'SAL-A',
        saleDate: '2026-03-15',
        productName: 'Bread',
        quantity: 1,
      }),
    ]);

    expect(groups.map((group) => group.groupKey)).toEqual(['number:SAL-A', 'number:SAL-B']);
  });

  it('does not mutate input rows', () => {
    const source = row(2, {
      saleNumber: 'SAL-1',
      saleDate: '2026-03-15',
      productName: 'Bread',
      quantity: 1,
    });
    const snapshot = structuredClone(source);

    groupSaleImportRows([source]);

    expect(source).toEqual(snapshot);
  });
});

describe('saleImportHeaderValuesConflict', () => {
  it('detects conflicting sale dates', () => {
    expect(
      saleImportHeaderValuesConflict('saleDate', '2026-03-15', '2026-03-16'),
    ).toBe(true);
  });

  it('treats matching trimmed customer names as equal', () => {
    expect(saleImportHeaderValuesConflict('customerName', ' Alice ', 'alice')).toBe(false);
  });
});
