/**
 * Mapper tests — protect the column-renaming contract: mapped columns are
 * renamed, unmapped columns are ignored (and reported), and missing
 * required target fields surface as data, not exceptions.
 */

import { describe, expect, it } from 'vitest';

import { applyMapping } from '@/lib/import/engine/mapper';
import type { ColumnDefinition, ParsedFile } from '@/lib/import/engine/types';

const parsed: Pick<ParsedFile, 'headers' | 'rows'> = {
  headers: ['Item Name', 'Sale Price', 'HSN'],
  rows: [
    {
      rowNumber: 2,
      cells: { 'Item Name': 'Bread', 'Sale Price': 40, HSN: '1905' },
    },
  ],
};

const definitions: ColumnDefinition[] = [
  { field: 'name', label: 'Name', dataType: 'string', required: true },
  { field: 'price', label: 'Price', dataType: 'money', required: true },
];

describe('applyMapping', () => {
  it('renames mapped source columns to target fields and ignores the rest', () => {
    const result = applyMapping(
      parsed,
      {
        columnMappings: [
          { sourceHeader: 'Item Name', targetField: 'name' },
          { sourceHeader: 'Sale Price', targetField: 'price' },
        ],
      },
      definitions,
    );

    expect(result.rows[0]?.values).toEqual({ name: 'Bread', price: 40 });
    expect(result.ignoredHeaders).toEqual(['HSN']);
    expect(result.missingRequiredFields).toEqual([]);
  });

  it('reports required target fields that have no usable source column', () => {
    const result = applyMapping(
      parsed,
      { columnMappings: [{ sourceHeader: 'Item Name', targetField: 'name' }] },
      definitions,
    );

    expect(result.missingRequiredFields).toEqual(['price']);
  });

  it('reports mapped source headers that do not exist in the file', () => {
    const result = applyMapping(
      parsed,
      {
        columnMappings: [
          { sourceHeader: 'Item Name', targetField: 'name' },
          { sourceHeader: 'MRP', targetField: 'price' },
        ],
      },
      definitions,
    );

    expect(result.missingSourceHeaders).toEqual(['MRP']);
    // "price" was mapped, but its source column is absent → still missing.
    expect(result.missingRequiredFields).toEqual(['price']);
  });

  it('rejects a config that maps the same target field twice', () => {
    expect(() =>
      applyMapping(parsed, {
        columnMappings: [
          { sourceHeader: 'Item Name', targetField: 'name' },
          { sourceHeader: 'HSN', targetField: 'name' },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({ name: 'ImportEngineError', code: 'INVALID_MAPPING' }),
    );
  });
});
