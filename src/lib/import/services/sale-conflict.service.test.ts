/**
 * Sale Import Conflict Detection tests.
 */

import { describe, expect, it } from 'vitest';

import { SALE_GROUP_ISSUE_CODES } from '@/lib/import/services/sale-import-grouping.service';
import {
  SALE_PRODUCT_RESOLUTION_ISSUE_CODES,
  type ResolvedSaleImportGroup,
  type ResolvedSaleImportLineItem,
} from '@/lib/import/services/sale-import-product-resolver';
import {
  areSalesExactDuplicates,
  buildSaleNumberIndex,
  detectSaleImportConflicts,
  saleImportFingerprint,
  type ExistingSaleMatch,
  type SaleNumberIndex,
} from '@/lib/import/services/sale-conflict.service';
import type { NormalizedValue, ValidationIssue } from '@/lib/import/engine/types';
import type { ExistingProductMatch } from '@/lib/import/services/conflict.service';

const bread: ExistingProductMatch = { id: 'prod-bread', name: 'Milk Bread', code: 'BRD-001' };
const cake: ExistingProductMatch = { id: 'prod-cake', name: 'Chocolate Cake', code: 'CKE-010' };

function saleIndex(entries: Record<string, ExistingSaleMatch>): SaleNumberIndex {
  return new Map(Object.entries(entries));
}

function resolvedLine(
  rowNumber: number,
  values: Record<string, NormalizedValue>,
  options: {
    resolvedProduct?: ExistingProductMatch | null;
    status?: ResolvedSaleImportLineItem['status'];
    issues?: ValidationIssue[];
  } = {},
): ResolvedSaleImportLineItem {
  return {
    rowNumber,
    values,
    status: options.status ?? 'valid',
    issues: options.issues ?? [],
    resolvedProduct: options.resolvedProduct ?? null,
  };
}

function resolvedGroup(
  groupKey: string,
  lines: ResolvedSaleImportLineItem[],
  options: {
    saleNumber?: string | null;
    saleDate?: NormalizedValue;
    customerName?: NormalizedValue;
    notes?: NormalizedValue;
    groupIssues?: ValidationIssue[];
  } = {},
): ResolvedSaleImportGroup {
  const saleNumber = options.saleNumber === undefined ? 'SAL-DEFAULT' : options.saleNumber;
  const normalizedSaleNumber = saleNumber ? saleNumber.trim().toUpperCase() : null;

  return {
    groupKey,
    rowNumbers: lines.map((line) => line.rowNumber),
    header: {
      saleNumber,
      normalizedSaleNumber,
      saleDate: options.saleDate ?? '2026-03-15',
      customerName: options.customerName ?? 'Corner Store',
      notes: options.notes ?? null,
    },
    lines,
    groupIssues: options.groupIssues ?? [],
  };
}

function saleGroup(
  saleNumber: string,
  rowNumber: number,
  product: ExistingProductMatch,
  quantity: number,
  sellingPrice: number,
  overrides: {
    saleDate?: NormalizedValue;
    customerName?: NormalizedValue;
    notes?: NormalizedValue;
    groupKey?: string;
  } = {},
): ResolvedSaleImportGroup {
  const normalized = saleNumber.trim().toUpperCase();

  return resolvedGroup(
    overrides.groupKey ?? `number:${normalized}`,
    [
      resolvedLine(rowNumber, {
        productCode: product.code,
        productName: product.name,
        quantity,
        sellingPrice,
      }, { resolvedProduct: product }),
    ],
    {
      saleNumber,
      saleDate: overrides.saleDate,
      customerName: overrides.customerName,
      notes: overrides.notes,
    },
  );
}

describe('saleImportFingerprint', () => {
  it('treats groups with identical header and line data as exact duplicates', () => {
    const left = saleGroup('SAL-100', 2, bread, 1, 45);
    const right = saleGroup('SAL-100', 4, bread, 1, 45);

    expect(saleImportFingerprint(left)).toBe(saleImportFingerprint(right));
    expect(areSalesExactDuplicates([left, right])).toBe(true);
  });

  it('detects conflicting sales when line quantities differ', () => {
    const left = saleGroup('SAL-100', 2, bread, 1, 45);
    const right = saleGroup('SAL-100', 4, bread, 2, 45);

    expect(areSalesExactDuplicates([left, right])).toBe(false);
  });
});

describe('detectSaleImportConflicts', () => {
  it('returns all groups as clean when every sale number is unique and new', () => {
    const groups = [
      saleGroup('SAL-001', 2, bread, 1, 45),
      saleGroup('SAL-002', 3, cake, 2, 120),
    ];

    const result = detectSaleImportConflicts(groups);

    expect(result.exactDuplicateSales).toEqual([]);
    expect(result.conflictingDuplicateSales).toEqual([]);
    expect(result.existingSales).toEqual([]);
    expect(result.cleanGroups.map((group) => group.groupKey)).toEqual([
      'number:SAL-001',
      'number:SAL-002',
    ]);
    expect(result.conflictingGroups).toEqual([]);
    expect(result.summary.cleanGroupCount).toBe(2);
  });

  it('treats two identical numbered sales as exact duplicates and keeps the first', () => {
    const kept = saleGroup('SAL-100', 2, bread, 1, 45, { groupKey: 'candidate-a' });
    const duplicate = saleGroup('SAL-100', 5, bread, 1, 45, { groupKey: 'candidate-b' });

    const result = detectSaleImportConflicts([kept, duplicate]);

    expect(result.conflictingDuplicateSales).toEqual([]);
    expect(result.exactDuplicateSales).toEqual([
      {
        groupKey: 'candidate-b',
        saleNumber: 'SAL-100',
        normalizedSaleNumber: 'SAL-100',
        rowNumbers: [5],
        keptGroupKey: 'candidate-a',
      },
    ]);
    expect(result.cleanGroups).toHaveLength(1);
    expect(result.cleanGroups[0]?.groupKey).toBe('candidate-a');
    expect(result.conflictingGroups).toHaveLength(1);
    expect(result.summary.exactDuplicateGroupCount).toBe(1);
  });

  it('flags same sale number with different data as conflicting duplicates', () => {
    const groups = [
      saleGroup('SAL-200', 2, bread, 1, 45, { groupKey: 'candidate-a' }),
      saleGroup('SAL-200', 4, bread, 2, 45, { groupKey: 'candidate-b' }),
    ];

    const result = detectSaleImportConflicts(groups);

    expect(result.exactDuplicateSales).toEqual([]);
    expect(result.conflictingDuplicateSales).toHaveLength(2);
    expect(result.conflictingDuplicateSales[0]).toMatchObject({
      normalizedSaleNumber: 'SAL-200',
      conflictingGroupKeys: ['candidate-b'],
    });
    expect(result.cleanGroups).toEqual([]);
    expect(result.conflictingGroups).toHaveLength(2);
    expect(result.summary.conflictingDuplicateSaleCount).toBe(1);
  });

  it('flags groups whose sale numbers already exist in BakeryOS', () => {
    const existing = saleIndex({
      'SAL-300': {
        id: 'sale-1',
        saleNumber: 'SAL-300',
        saleDate: '2026-03-01',
        customerNameSnapshot: 'Old Customer',
      },
    });

    const result = detectSaleImportConflicts(
      [saleGroup('SAL-300', 2, bread, 1, 45), saleGroup('SAL-400', 3, cake, 1, 120)],
      existing,
    );

    expect(result.existingSales).toEqual([
      {
        groupKey: 'number:SAL-300',
        saleNumber: 'SAL-300',
        normalizedSaleNumber: 'SAL-300',
        rowNumbers: [2],
        existingSale: existing.get('SAL-300'),
      },
    ]);
    expect(result.cleanGroups.map((group) => group.groupKey)).toEqual(['number:SAL-400']);
    expect(result.conflictingGroups.map((group) => group.groupKey)).toEqual(['number:SAL-300']);
  });

  it('matches sale numbers case-insensitively and with trimmed whitespace', () => {
    const existing = saleIndex({
      'SAL-500': {
        id: 'sale-5',
        saleNumber: 'SAL-500',
        saleDate: '2026-03-01',
        customerNameSnapshot: null,
      },
    });

    const result = detectSaleImportConflicts(
      [saleGroup(' sal-500 ', 2, bread, 1, 45)],
      existing,
    );

    expect(result.existingSales).toHaveLength(1);
    expect(result.cleanGroups).toEqual([]);
  });

  it('treats trimmed and mixed-case identical numbered sales as exact duplicates', () => {
    const kept = saleGroup('SAL-600', 2, bread, 1, 45, { groupKey: 'candidate-a' });
    const duplicate = saleGroup(' sal-600 ', 4, bread, 1, 45, { groupKey: 'candidate-b' });

    const result = detectSaleImportConflicts([kept, duplicate]);

    expect(result.summary.exactDuplicateGroupCount).toBe(1);
    expect(result.summary.conflictingDuplicateGroupCount).toBe(0);
    expect(result.cleanGroups).toHaveLength(1);
  });

  it('detects exact duplicate unnumbered sales by fingerprint', () => {
    const kept = resolvedGroup(
      'fallback:2026-03-15|corner store',
      [
        resolvedLine(2, {
          productName: 'Milk Bread',
          quantity: 1,
          sellingPrice: 45,
        }, { resolvedProduct: bread }),
      ],
      { saleNumber: null, customerName: 'Corner Store' },
    );
    const duplicate = resolvedGroup(
      'fallback:2026-03-15|corner store-copy',
      [
        resolvedLine(4, {
          productName: 'Milk Bread',
          quantity: 1,
          sellingPrice: 45,
        }, { resolvedProduct: bread }),
      ],
      { saleNumber: null, customerName: 'Corner Store' },
    );

    const result = detectSaleImportConflicts([kept, duplicate]);

    expect(result.exactDuplicateSales).toHaveLength(1);
    expect(result.exactDuplicateSales[0]?.keptGroupKey).toBe(kept.groupKey);
    expect(result.cleanGroups).toHaveLength(1);
    expect(result.conflictingGroups).toHaveLength(1);
  });

  it('puts groups with unresolved products into conflictingGroups', () => {
    const unresolvedIssue: ValidationIssue = {
      severity: 'error',
      code: SALE_PRODUCT_RESOLUTION_ISSUE_CODES.PRODUCT_NOT_FOUND,
      message: 'Missing product',
      field: 'productName',
    };

    const group = resolvedGroup(
      'number:SAL-700',
      [
        resolvedLine(
          2,
          { productName: 'Missing Loaf', quantity: 1 },
          { status: 'error', issues: [unresolvedIssue] },
        ),
      ],
      { saleNumber: 'SAL-700' },
    );

    const result = detectSaleImportConflicts([group]);

    expect(result.cleanGroups).toEqual([]);
    expect(result.conflictingGroups).toHaveLength(1);
    expect(result.conflictingGroups[0]?.lines[0]?.issues).toEqual([unresolvedIssue]);
    expect(result.summary.lineErrorGroupCount).toBe(1);
  });

  it('puts groups with grouping header issues into conflictingGroups', () => {
    const groupIssue: ValidationIssue = {
      severity: 'error',
      code: SALE_GROUP_ISSUE_CODES.CONFLICTING_SALE_DATE,
      message: 'Sale Date differs',
      field: 'saleDate',
    };

    const group = resolvedGroup(
      'number:SAL-800',
      [
        resolvedLine(2, {
          productCode: 'BRD-001',
          productName: 'Milk Bread',
          quantity: 1,
          sellingPrice: 45,
        }, { resolvedProduct: bread }),
      ],
      { saleNumber: 'SAL-800', groupIssues: [groupIssue] },
    );

    const result = detectSaleImportConflicts([group]);

    expect(result.cleanGroups).toEqual([]);
    expect(result.conflictingGroups[0]?.groupIssues).toEqual([groupIssue]);
    expect(result.summary.groupIssueGroupCount).toBe(1);
  });

  it('preserves all validation issues on clean and conflicting groups', () => {
    const warningIssue: ValidationIssue = {
      severity: 'warning',
      code: 'TEST_WARNING',
      message: 'Minor issue',
      field: 'sellingPrice',
    };

    const group = resolvedGroup(
      'number:SAL-900',
      [
        resolvedLine(
          2,
          {
            productCode: 'BRD-001',
            productName: 'Milk Bread',
            quantity: 1,
            sellingPrice: 45,
          },
          { resolvedProduct: bread, status: 'warning', issues: [warningIssue] },
        ),
      ],
      { saleNumber: 'SAL-900' },
    );

    const result = detectSaleImportConflicts([group]);

    expect(result.cleanGroups[0]?.lines[0]?.issues).toEqual([warningIssue]);
    expect(result.cleanGroups[0]?.lines[0]?.status).toBe('warning');
  });

  it('reports mixed exact duplicates, conflicting duplicates, and existing sales', () => {
    const existing = saleIndex({
      'SAL-EXIST': {
        id: 'sale-existing',
        saleNumber: 'SAL-EXIST',
        saleDate: '2026-03-01',
        customerNameSnapshot: 'Existing Customer',
      },
    });

    const result = detectSaleImportConflicts(
      [
        saleGroup('SAL-A', 2, bread, 1, 45, { groupKey: 'candidate-a1' }),
        saleGroup('SAL-A', 3, bread, 1, 45, { groupKey: 'candidate-a2' }),
        saleGroup('SAL-B', 4, bread, 1, 45, { groupKey: 'candidate-b1' }),
        saleGroup('SAL-B', 5, bread, 2, 45, { groupKey: 'candidate-b2' }),
        saleGroup('SAL-EXIST', 6, cake, 1, 120),
        saleGroup('SAL-C', 7, cake, 1, 120),
      ],
      existing,
    );

    expect(result.summary.exactDuplicateGroupCount).toBe(1);
    expect(result.summary.conflictingDuplicateGroupCount).toBe(2);
    expect(result.summary.existingSaleCount).toBe(1);
    expect(result.cleanGroups.map((group) => group.groupKey)).toEqual([
      'candidate-a1',
      'number:SAL-C',
    ]);
  });

  it('does not mutate input groups', () => {
    const groups = [saleGroup('SAL-001', 2, bread, 1, 45)];
    const snapshot = structuredClone(groups);

    detectSaleImportConflicts(groups);

    expect(groups).toEqual(snapshot);
  });
});

describe('buildSaleNumberIndex', () => {
  it('indexes normalized sale numbers with first-wins semantics', () => {
    const index = buildSaleNumberIndex([
      {
        id: 'sale-1',
        data: {
          saleNumber: ' sal-100 ',
          saleDate: '2026-03-15',
          customerNameSnapshot: 'Alice',
          deletedAt: null,
        },
      },
      {
        id: 'sale-2',
        data: {
          saleNumber: 'SAL-100',
          saleDate: '2026-03-16',
          customerNameSnapshot: 'Bob',
          deletedAt: null,
        },
      },
    ]);

    expect(index.get('SAL-100')).toEqual({
      id: 'sale-1',
      saleNumber: ' sal-100 ',
      saleDate: '2026-03-15',
      customerNameSnapshot: 'Alice',
    });
  });
});
