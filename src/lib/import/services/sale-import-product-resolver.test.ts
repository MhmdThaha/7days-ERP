/**
 * Sale Import Product Resolution tests.
 */

import { describe, expect, it } from 'vitest';

import { SALE_ISSUE_CODES } from '@/lib/import/definitions/sale.definition';
import type { NormalizedValue, ValidationIssue } from '@/lib/import/engine/types';
import {
  normalizeProductCode,
  normalizeProductName,
  type ExistingProductMatch,
  type ProductImportIndex,
} from '@/lib/import/services/conflict.service';
import type {
  SaleImportGroup,
  SaleImportLineItem,
} from '@/lib/import/services/sale-import-grouping.service';
import {
  buildAmbiguousProductNameSet,
  buildProductImportIndexFromDocs,
  resolveSaleImportLineItem,
  resolveSaleImportProducts,
  SALE_PRODUCT_RESOLUTION_ISSUE_CODES,
} from '@/lib/import/services/sale-import-product-resolver';
import type { ProductDocument } from '@/lib/repositories/product.repository';

const bread: ExistingProductMatch = { id: 'prod-bread', name: 'Milk Bread', code: 'BRD-001' };
const cake: ExistingProductMatch = { id: 'prod-cake', name: 'Chocolate Cake', code: 'CKE-010' };

function productIndex(
  byName: Record<string, ExistingProductMatch>,
  byCode: Record<string, ExistingProductMatch> = {},
): ProductImportIndex {
  return {
    byName: new Map(
      Object.entries(byName).map(([key, value]) => [normalizeProductName(key), value]),
    ),
    byCode: new Map(
      Object.entries(byCode).map(([key, value]) => [normalizeProductCode(key), value]),
    ),
  };
}

function line(
  rowNumber: number,
  values: Record<string, NormalizedValue>,
  options: {
    status?: SaleImportLineItem['status'];
    issues?: ValidationIssue[];
  } = {},
): SaleImportLineItem {
  return {
    rowNumber,
    values,
    status: options.status ?? 'valid',
    issues: options.issues ?? [],
  };
}

function group(groupKey: string, lines: SaleImportLineItem[]): SaleImportGroup {
  return {
    groupKey,
    rowNumbers: lines.map((entry) => entry.rowNumber),
    header: {
      saleNumber: null,
      normalizedSaleNumber: null,
      saleDate: '2026-03-15',
      customerName: 'Corner Store',
      notes: null,
    },
    lines,
    groupIssues: [],
  };
}

function productDoc(
  id: string,
  name: string,
  code: string,
): { id: string; data: ProductDocument } {
  return {
    id,
    data: {
      name,
      code,
      category: 'Bread',
      unit: 'pcs',
      sellingPrice: 50,
      costPrice: 30,
      gstRate: 5,
      openingStock: 0,
      minimumStock: 0,
      createdAt: null,
      updatedAt: null,
      deletedAt: null,
    },
  };
}

describe('resolveSaleImportLineItem', () => {
  const index = productIndex(
    { 'Milk Bread': bread, 'Chocolate Cake': cake },
    { 'BRD-001': bread, 'CKE-010': cake },
  );

  it('matches by product code first', () => {
    const resolved = resolveSaleImportLineItem(
      line(2, { productCode: ' brd-001 ', productName: 'Wrong Name', quantity: 1 }),
      index,
    );

    expect(resolved.resolvedProduct).toEqual(bread);
    expect(resolved.issues).toEqual([]);
    expect(resolved.status).toBe('valid');
  });

  it('matches by product name when code is unavailable', () => {
    const resolved = resolveSaleImportLineItem(
      line(3, { productName: ' milk bread ', quantity: 2 }),
      index,
    );

    expect(resolved.resolvedProduct).toEqual(bread);
    expect(resolved.issues).toEqual([]);
  });

  it('falls back to product name when code is not found', () => {
    const resolved = resolveSaleImportLineItem(
      line(4, { productCode: 'MISSING', productName: 'Chocolate Cake', quantity: 1 }),
      index,
    );

    expect(resolved.resolvedProduct).toEqual(cake);
    expect(resolved.issues).toEqual([]);
  });

  it('is case-insensitive for code and name matching', () => {
    expect(
      resolveSaleImportLineItem(line(5, { productCode: 'cke-010', quantity: 1 }), index)
        .resolvedProduct,
    ).toEqual(cake);
    expect(
      resolveSaleImportLineItem(line(6, { productName: 'CHOCOLATE CAKE', quantity: 1 }), index)
        .resolvedProduct,
    ).toEqual(cake);
  });

  it('attaches PRODUCT_NOT_FOUND when neither code nor name resolves', () => {
    const resolved = resolveSaleImportLineItem(
      line(7, { productCode: 'NOPE', productName: 'Unknown Item', quantity: 1 }),
      index,
    );

    expect(resolved.resolvedProduct).toBeNull();
    expect(resolved.status).toBe('error');
    expect(resolved.issues).toEqual([
      expect.objectContaining({
        code: SALE_PRODUCT_RESOLUTION_ISSUE_CODES.PRODUCT_NOT_FOUND,
        field: 'productCode',
        severity: 'error',
      }),
    ]);
  });

  it('attaches PRODUCT_NOT_FOUND when only name is provided and missing', () => {
    const resolved = resolveSaleImportLineItem(
      line(8, { productName: 'Mystery Loaf', quantity: 1 }),
      index,
    );

    expect(resolved.resolvedProduct).toBeNull();
    expect(resolved.issues[0]).toMatchObject({
      code: SALE_PRODUCT_RESOLUTION_ISSUE_CODES.PRODUCT_NOT_FOUND,
      field: 'productName',
    });
  });

  it('rejects ambiguous product names instead of picking the first match', () => {
    const resolved = resolveSaleImportLineItem(
      line(9, { productName: 'Milk Bread', quantity: 1 }),
      index,
      new Set([normalizeProductName('Milk Bread')]),
    );

    expect(resolved.resolvedProduct).toBeNull();
    expect(resolved.status).toBe('error');
    expect(resolved.issues).toEqual([
      expect.objectContaining({
        code: SALE_PRODUCT_RESOLUTION_ISSUE_CODES.AMBIGUOUS_PRODUCT_NAME,
        field: 'productName',
      }),
    ]);
  });

  it('still resolves by code when the product name is ambiguous', () => {
    const resolved = resolveSaleImportLineItem(
      line(10, { productCode: 'BRD-001', productName: 'Milk Bread', quantity: 1 }),
      index,
      new Set([normalizeProductName('Milk Bread')]),
    );

    expect(resolved.resolvedProduct).toEqual(bread);
    expect(resolved.issues).toEqual([]);
  });

  it('preserves existing line issues and upgrades status on resolution failure', () => {
    const existingIssue: ValidationIssue = {
      severity: 'warning',
      code: 'TEST_WARNING',
      message: 'Minor issue',
      field: 'sellingPrice',
    };

    const resolved = resolveSaleImportLineItem(
      line(11, { productName: 'Missing Product', quantity: 1 }, { issues: [existingIssue] }),
      index,
    );

    expect(resolved.issues).toHaveLength(2);
    expect(resolved.issues[0]).toEqual(existingIssue);
    expect(resolved.issues[1]).toMatchObject({
      code: SALE_PRODUCT_RESOLUTION_ISSUE_CODES.PRODUCT_NOT_FOUND,
    });
    expect(resolved.status).toBe('error');
  });

  it('leaves lines without product references unchanged', () => {
    const existingIssue: ValidationIssue = {
      severity: 'error',
      code: SALE_ISSUE_CODES.PRODUCT_REFERENCE_REQUIRED,
      message: 'Product Name or Product Code is required on every row.',
      field: 'productName',
    };

    const source = line(12, { quantity: 1 }, { status: 'error', issues: [existingIssue] });
    const resolved = resolveSaleImportLineItem(source, index);

    expect(resolved).toEqual({
      ...source,
      resolvedProduct: null,
    });
  });
});

describe('resolveSaleImportProducts', () => {
  const index = productIndex(
    { 'Milk Bread': bread, 'Chocolate Cake': cake },
    { 'BRD-001': bread, 'CKE-010': cake },
  );

  it('preserves group structure, row numbers, values, and group issues', () => {
    const groupIssue: ValidationIssue = {
      severity: 'error',
      code: 'CONFLICTING_SALE_DATE',
      message: 'Sale Date differs',
      field: 'saleDate',
    };

    const sourceGroup: SaleImportGroup = {
      groupKey: 'number:SAL-100',
      rowNumbers: [2, 3],
      header: {
        saleNumber: 'SAL-100',
        normalizedSaleNumber: 'SAL-100',
        saleDate: '2026-03-15',
        customerName: 'Alice',
        notes: 'Morning run',
      },
      lines: [
        line(2, { productCode: 'BRD-001', quantity: 1 }),
        line(3, { productName: 'Chocolate Cake', quantity: 2 }),
      ],
      groupIssues: [groupIssue],
    };

    const [resolved] = resolveSaleImportProducts([sourceGroup], index);

    expect(resolved?.groupKey).toBe('number:SAL-100');
    expect(resolved?.rowNumbers).toEqual([2, 3]);
    expect(resolved?.header).toEqual(sourceGroup.header);
    expect(resolved?.groupIssues).toEqual([groupIssue]);
    expect(resolved?.lines[0]?.rowNumber).toBe(2);
    expect(resolved?.lines[0]?.values).toEqual(sourceGroup.lines[0]?.values);
    expect(resolved?.lines[1]?.resolvedProduct).toEqual(cake);
  });

  it('resolves mixed lines within one sale group', () => {
    const [resolved] = resolveSaleImportProducts(
      [
        group('number:SAL-200', [
          line(2, { productCode: ' brd-001 ', quantity: 1 }),
          line(3, { productName: ' chocolate cake ', quantity: 2 }),
          line(4, { productName: 'Missing Loaf', quantity: 1 }),
        ]),
      ],
      index,
    );

    expect(resolved?.lines[0]?.resolvedProduct).toEqual(bread);
    expect(resolved?.lines[1]?.resolvedProduct).toEqual(cake);
    expect(resolved?.lines[2]?.resolvedProduct).toBeNull();
    expect(resolved?.lines[2]?.issues[0]).toMatchObject({
      code: SALE_PRODUCT_RESOLUTION_ISSUE_CODES.PRODUCT_NOT_FOUND,
    });
  });

  it('does not mutate input groups', () => {
    const sourceGroup = group('number:SAL-300', [
      line(2, { productCode: 'BRD-001', quantity: 1 }),
    ]);
    const snapshot = structuredClone(sourceGroup);

    resolveSaleImportProducts([sourceGroup], index);

    expect(sourceGroup).toEqual(snapshot);
  });
});

describe('buildProductImportIndexFromDocs', () => {
  it('builds case-insensitive name and code indexes with first-wins semantics', () => {
    const index = buildProductImportIndexFromDocs([
      productDoc('p1', 'Milk Bread', 'BRD-001'),
      productDoc('p2', 'Other Bread', 'BRD-002'),
    ]);

    expect(index.byCode.get('BRD-001')).toEqual({
      id: 'p1',
      name: 'Milk Bread',
      code: 'BRD-001',
    });
    expect(index.byName.get(normalizeProductName(' milk bread '))).toEqual({
      id: 'p1',
      name: 'Milk Bread',
      code: 'BRD-001',
    });
  });
});

describe('buildAmbiguousProductNameSet', () => {
  it('flags normalized names shared by multiple products', () => {
    const ambiguous = buildAmbiguousProductNameSet([
      productDoc('p1', 'Milk Bread', 'BRD-001'),
      productDoc('p2', 'Milk Bread', 'BRD-ALT'),
      productDoc('p3', 'Chocolate Cake', 'CKE-010'),
    ]);

    expect(ambiguous.has(normalizeProductName('MILK BREAD'))).toBe(true);
    expect(ambiguous.has(normalizeProductName('Chocolate Cake'))).toBe(false);
  });
});

describe('duplicate product names end-to-end', () => {
  it('blocks name matching when BakeryOS has duplicate product names', () => {
    const docs = [
      productDoc('p1', 'Garlic Bread', 'GB-001'),
      productDoc('p2', 'Garlic Bread', 'GB-002'),
    ];
    const index = buildProductImportIndexFromDocs(docs);
    const ambiguousNames = buildAmbiguousProductNameSet(docs);

    const [resolved] = resolveSaleImportProducts(
      [group('number:SAL-400', [line(2, { productName: ' garlic bread ', quantity: 1 })])],
      index,
      { ambiguousNames },
    );

    expect(resolved?.lines[0]?.resolvedProduct).toBeNull();
    expect(resolved?.lines[0]?.issues[0]).toMatchObject({
      code: SALE_PRODUCT_RESOLUTION_ISSUE_CODES.AMBIGUOUS_PRODUCT_NAME,
    });
  });
});
