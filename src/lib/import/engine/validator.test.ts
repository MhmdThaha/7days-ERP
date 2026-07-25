/**
 * Validator tests — protect the "never throw for row problems" contract:
 * required fields, type checks, allowed values, and custom validators all
 * turn into structured issues with a correct per-row status.
 */

import { describe, expect, it } from 'vitest';

import {
  ISSUE_CODES,
  type ColumnDefinition,
  type NormalizedRow,
} from '@/lib/import/engine/types';
import { validateRows } from '@/lib/import/engine/validator';

const definitions: ColumnDefinition[] = [
  { field: 'name', label: 'Name', dataType: 'string', required: true },
  { field: 'price', label: 'Price', dataType: 'money', required: false },
  {
    field: 'unit',
    label: 'Unit',
    dataType: 'string',
    required: false,
    allowedValues: ['pcs', 'kg'],
  },
];

function row(values: NormalizedRow['values'], rowNumber = 2): NormalizedRow {
  return { rowNumber, values, warnings: [] };
}

describe('validateRows', () => {
  it('flags a missing required field as an error', () => {
    const result = validateRows([row({ name: null, price: 40 })], definitions);

    expect(result.rows[0]?.status).toBe('error');
    expect(result.rows[0]?.issues).toContainEqual(
      expect.objectContaining({
        code: ISSUE_CODES.REQUIRED_FIELD_MISSING,
        field: 'name',
        severity: 'error',
      }),
    );
  });

  it('flags values of the wrong type (number, date, boolean fields)', () => {
    const defs: ColumnDefinition[] = [
      { field: 'qty', label: 'Qty', dataType: 'number', required: false },
      { field: 'expiry', label: 'Expiry', dataType: 'date', required: false },
      { field: 'active', label: 'Active', dataType: 'boolean', required: false },
    ];

    const result = validateRows(
      [row({ qty: 'a lot', expiry: 'tomorrow', active: 'maybe' })],
      defs,
    );

    const codes = result.rows[0]?.issues.map((issue) => issue.code);

    expect(codes).toEqual([
      ISSUE_CODES.INVALID_TYPE,
      ISSUE_CODES.INVALID_TYPE,
      ISSUE_CODES.INVALID_TYPE,
    ]);
    expect(result.rows[0]?.status).toBe('error');
  });

  it('enforces allowedValues case-insensitively', () => {
    const ok = validateRows([row({ name: 'Bread', unit: 'KG' })], definitions);
    const bad = validateRows([row({ name: 'Bread', unit: 'box' })], definitions);

    expect(ok.rows[0]?.status).toBe('valid');
    expect(bad.rows[0]?.issues).toContainEqual(
      expect.objectContaining({ code: ISSUE_CODES.VALUE_NOT_ALLOWED, field: 'unit' }),
    );
  });

  it('includes issues returned by a custom field validator', () => {
    const result = validateRows([row({ name: 'Bread', price: -5 })], definitions, {
      fieldValidators: {
        price: (value) =>
          typeof value === 'number' && value < 0
            ? [
                {
                  severity: 'error',
                  code: 'NEGATIVE_PRICE',
                  message: 'Price cannot be negative.',
                  field: 'price',
                },
              ]
            : [],
      },
    });

    expect(result.rows[0]?.issues).toContainEqual(
      expect.objectContaining({ code: 'NEGATIVE_PRICE' }),
    );
  });

  it('converts a throwing custom validator into an issue instead of crashing', () => {
    const result = validateRows([row({ name: 'Bread' })], definitions, {
      rowValidators: [
        () => {
          throw new Error('boom');
        },
      ],
    });

    expect(result.rows[0]?.status).toBe('error');
    expect(result.rows[0]?.issues).toContainEqual(
      expect.objectContaining({ code: ISSUE_CODES.CUSTOM_VALIDATOR_FAILED }),
    );
  });

  it('carries normalizer warnings into the row and derives a warning status', () => {
    const withWarning: NormalizedRow = {
      rowNumber: 3,
      values: { name: 'Bread', price: null },
      warnings: [
        {
          severity: 'warning',
          code: ISSUE_CODES.INVALID_NUMBER,
          message: '"forty" is not a valid money and was left empty.',
          field: 'price',
        },
      ],
    };

    const result = validateRows([withWarning], definitions);

    expect(result.rows[0]?.status).toBe('warning');
    expect(result.rows[0]?.issues).toHaveLength(1);
  });

  it('collects issues across many rows and summarizes without throwing', () => {
    const result = validateRows(
      [
        row({ name: 'Bread', unit: 'pcs' }, 2), // valid
        row({ name: null }, 3), // error: required missing
        {
          rowNumber: 4,
          values: { name: 'Cake' },
          warnings: [
            {
              severity: 'warning',
              code: ISSUE_CODES.INVALID_NUMBER,
              message: 'bad number',
              field: 'price',
            },
          ],
        }, // warning
      ],
      definitions,
    );

    expect(result.summary).toEqual({
      totalRows: 3,
      validRows: 1,
      warningRows: 1,
      errorRows: 1,
    });
  });
});
