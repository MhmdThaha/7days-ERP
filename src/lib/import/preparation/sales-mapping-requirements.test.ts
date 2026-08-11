import { describe, expect, it } from 'vitest';

import { SALE_IMPORT_COLUMNS } from '@/lib/import/definitions/sale.definition';
import {
  getSalesMappingMissingRequirements,
  isSalesMappingReady,
  mappingIncludesSaleDate,
} from '@/lib/import/preparation/sales-mapping-requirements';

describe('sales mapping requirements', () => {
  it('allows mapping to continue without saleDate when product and quantity are mapped', () => {
    const mapping = {
      columnMappings: [
        { sourceHeader: 'Product', targetField: 'productName' },
        { sourceHeader: 'Qty', targetField: 'quantity' },
      ],
    };

    expect(mappingIncludesSaleDate(mapping)).toBe(false);
    expect(isSalesMappingReady(mapping, SALE_IMPORT_COLUMNS)).toBe(true);
    expect(getSalesMappingMissingRequirements(mapping, SALE_IMPORT_COLUMNS)).toEqual([]);
  });

  it('blocks mapping when product is missing', () => {
    const mapping = {
      columnMappings: [{ sourceHeader: 'Qty', targetField: 'quantity' }],
    };

    expect(isSalesMappingReady(mapping, SALE_IMPORT_COLUMNS)).toBe(false);
    expect(getSalesMappingMissingRequirements(mapping, SALE_IMPORT_COLUMNS)[0]?.field).toBe('product');
  });

  it('blocks mapping when quantity is missing', () => {
    const mapping = {
      columnMappings: [{ sourceHeader: 'Product', targetField: 'productName' }],
    };

    expect(isSalesMappingReady(mapping, SALE_IMPORT_COLUMNS)).toBe(false);
    expect(getSalesMappingMissingRequirements(mapping, SALE_IMPORT_COLUMNS).some((entry) => entry.field === 'quantity')).toBe(
      true,
    );
  });

  it('accepts product code instead of product name', () => {
    const mapping = {
      columnMappings: [
        { sourceHeader: 'Code', targetField: 'productCode' },
        { sourceHeader: 'Qty', targetField: 'quantity' },
      ],
    };

    expect(isSalesMappingReady(mapping, SALE_IMPORT_COLUMNS)).toBe(true);
  });
});
