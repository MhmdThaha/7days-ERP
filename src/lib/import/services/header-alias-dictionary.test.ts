import { describe, expect, it } from 'vitest';

import { SALE_IMPORT_COLUMNS } from '@/lib/import/definitions/sale.definition';
import {
  buildNormalizedUniversalAliasLookup,
  CANONICAL_FIELD_TARGETS,
  mergeUniversalAliasesIntoIndex,
  resolveCanonicalFieldForColumns,
  SALES_HEADER_ALIASES,
} from '@/lib/import/services/header-alias-dictionary';
import { normalizeHeaderLabel } from '@/lib/import/services/header-detection.service';

describe('SALES_HEADER_ALIASES', () => {
  it('covers every canonical field required by Phase 1', () => {
    expect(Object.keys(SALES_HEADER_ALIASES).sort()).toEqual(
      [
        'amount',
        'customerName',
        'invoiceNumber',
        'productCode',
        'productName',
        'quantity',
        'saleDate',
        'unit',
      ].sort(),
    );
  });
});

describe('buildNormalizedUniversalAliasLookup', () => {
  it('maps quantity variants to the quantity canonical key', () => {
    const lookup = buildNormalizedUniversalAliasLookup(normalizeHeaderLabel);

    for (const header of [
      'Qty',
      'Quantity',
      'Sales Qty.',
      'Qty Sold',
      'SALES_QTY',
      'sales qty',
      'Sales Qty :',
      'Quantity (PCS)',
    ]) {
      expect(lookup.get(normalizeHeaderLabel(header))).toBe('quantity');
    }
  });

  it('maps amount variants to the amount canonical key', () => {
    const lookup = buildNormalizedUniversalAliasLookup(normalizeHeaderLabel);

    for (const header of ['Amount', 'Sales Amt.', 'Net Amount', 'Sale Value', 'Total']) {
      expect(lookup.get(normalizeHeaderLabel(header))).toBe('amount');
    }
  });

  it('returns null for empty normalized labels', () => {
    const lookup = buildNormalizedUniversalAliasLookup(normalizeHeaderLabel);
    expect(lookup.get('')).toBeUndefined();
  });
});

describe('resolveCanonicalFieldForColumns', () => {
  it('maps invoiceNumber to saleNumber on sale imports', () => {
    const fields = new Set(SALE_IMPORT_COLUMNS.map((column) => column.field));
    expect(resolveCanonicalFieldForColumns('invoiceNumber', fields)).toBe('saleNumber');
  });

  it('maps amount canonical key to amount column when present', () => {
    const fields = new Set(SALE_IMPORT_COLUMNS.map((column) => column.field));
    expect(resolveCanonicalFieldForColumns('amount', fields)).toBe('amount');
  });

  it('falls back to sellingPrice when amount column is absent', () => {
    const fields = new Set(['sellingPrice', 'quantity']);
    expect(resolveCanonicalFieldForColumns('amount', fields)).toBe('sellingPrice');
  });

  it('prefers amount over sellingPrice when both exist', () => {
    const fields = new Set(['amount', 'sellingPrice']);
    expect(resolveCanonicalFieldForColumns('amount', fields)).toBe('amount');
  });
});

describe('mergeUniversalAliasesIntoIndex', () => {
  it('registers Sales Qty. against quantity without overriding column synonyms', () => {
    const index = new Map<string, { field: string; required: boolean }>();
    index.set('sale qty', { field: 'quantity', required: true });

    mergeUniversalAliasesIntoIndex(index, SALE_IMPORT_COLUMNS, normalizeHeaderLabel);

    expect(index.get(normalizeHeaderLabel('Sales Qty.'))).toEqual({
      field: 'quantity',
      required: true,
    });
    expect(index.get('sale qty')).toEqual({ field: 'quantity', required: true });
  });

  it('registers Net Amount against amount for sale imports', () => {
    const index = new Map<string, { field: string; required: boolean }>();

    mergeUniversalAliasesIntoIndex(index, SALE_IMPORT_COLUMNS, normalizeHeaderLabel);

    expect(index.get(normalizeHeaderLabel('Net Amount'))).toEqual({
      field: 'amount',
      required: false,
    });
  });
});

describe('CANONICAL_FIELD_TARGETS', () => {
  it('keeps one target list per canonical field', () => {
    for (const canonical of Object.keys(SALES_HEADER_ALIASES)) {
      expect(CANONICAL_FIELD_TARGETS[canonical as keyof typeof CANONICAL_FIELD_TARGETS].length).toBeGreaterThan(0);
    }
  });
});
