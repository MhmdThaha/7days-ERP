/**
 * Normalizer tests — protect the messy-real-world coercions (currency,
 * percent, booleans, accounting negatives, Indian date formats, Excel
 * serials) that Vyapar/myBillBook/Busy exports rely on.
 */

import { describe, expect, it } from 'vitest';

import { normalizeRows } from '@/lib/import/engine/normalizer';
import {
  ISSUE_CODES,
  type ColumnDefinition,
  type FieldDataType,
  type RawCellValue,
} from '@/lib/import/engine/types';

/** Normalizes a single value through a single field of the given type. */
function normalizeOne(raw: RawCellValue, dataType: FieldDataType) {
  const definition: ColumnDefinition = {
    field: 'value',
    label: 'Value',
    dataType,
    required: false,
  };

  const [row] = normalizeRows(
    [{ rowNumber: 2, values: { value: raw } }],
    [definition],
  );

  if (!row) throw new Error('expected one normalized row');

  return { value: row.values['value'], warnings: row.warnings };
}

describe('normalizeRows', () => {
  it('strips currency symbols and grouping: "₹1,250" → 1250', () => {
    expect(normalizeOne('₹1,250', 'money')).toEqual({ value: 1250, warnings: [] });
  });

  it('strips percent signs: "5%" → 5', () => {
    expect(normalizeOne('5%', 'percent')).toEqual({ value: 5, warnings: [] });
  });

  it('parses accounting negatives: "(250)" → -250', () => {
    expect(normalizeOne('(250)', 'number')).toEqual({ value: -250, warnings: [] });
  });

  it('recognizes yes/no booleans', () => {
    expect(normalizeOne('YES', 'boolean').value).toBe(true);
    expect(normalizeOne('NO', 'boolean').value).toBe(false);
  });

  it('trims whitespace on strings: "  Bread  " → "Bread"', () => {
    expect(normalizeOne('  Bread  ', 'string')).toEqual({
      value: 'Bread',
      warnings: [],
    });
  });

  it.each([
    ['Bread', 'Bread '],
    ['Bread\t', 'Bread'],
    ['Bread   ', 'Bread'],
    [' Bread', 'Bread'],
    ['Bread ', 'Bread'],
  ])(
    'normalizes invisible whitespace variants of product names to the same value (%#)',
    (rawA, rawB) => {
      const normalizedA = normalizeOne(rawA, 'string').value;
      const normalizedB = normalizeOne(rawB, 'string').value;

      expect(normalizedA).toBe('Bread');
      expect(normalizedB).toBe('Bread');
      expect(normalizedA).toBe(normalizedB);
    },
  );

  it('turns empty and whitespace-only values into null without warnings', () => {
    expect(normalizeOne('', 'number')).toEqual({ value: null, warnings: [] });
    expect(normalizeOne('   ', 'string')).toEqual({ value: null, warnings: [] });
    expect(normalizeOne(null, 'date')).toEqual({ value: null, warnings: [] });
  });

  it('converts a valid Excel date serial to the right calendar day', () => {
    // Excel serial 45000 is 15 March 2023.
    const { value, warnings } = normalizeOne(45000, 'date');

    expect(warnings).toEqual([]);
    expect(value).toBeInstanceOf(Date);
    expect((value as Date).toISOString().slice(0, 10)).toBe('2023-03-15');
  });

  it('rejects an implausible Excel date serial with a warning', () => {
    const { value, warnings } = normalizeOne(3_000_000, 'date');

    expect(value).toBeNull();
    expect(warnings[0]?.code).toBe(ISSUE_CODES.INVALID_DATE);
  });

  it('parses day-first Indian dates: "15/03/2026"', () => {
    const { value, warnings } = normalizeOne('15/03/2026', 'date');

    expect(warnings).toEqual([]);
    expect((value as Date).toISOString().slice(0, 10)).toBe('2026-03-15');
  });

  it('rejects unparseable date text with a warning, not an exception', () => {
    const { value, warnings } = normalizeOne('next monday', 'date');

    expect(value).toBeNull();
    expect(warnings[0]?.code).toBe(ISSUE_CODES.INVALID_DATE);
  });

  it('rejects unparseable numbers with a warning, not an exception', () => {
    const { value, warnings } = normalizeOne('twelve', 'number');

    expect(value).toBeNull();
    expect(warnings[0]?.code).toBe(ISSUE_CODES.INVALID_NUMBER);
  });
});
