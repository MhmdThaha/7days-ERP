import { describe, expect, it } from 'vitest';

import type { NormalizedMappedRow } from '@/lib/import/preparation/sales-import-preparation.types';
import { prepareSalesImport } from '@/lib/import/preparation/sales-import-preparation.service';
import {
  ImportPreparationError,
  normalizedSaleDateToIso,
} from '@/lib/import/preparation/sales-import-preparation.types';

function row(
  rowNumber: number,
  values: NormalizedMappedRow['values'],
): NormalizedMappedRow {
  return {
    rowNumber,
    values,
    issues: [],
    status: 'valid',
    originalValues: {},
  };
}

describe('prepareSalesImport — sale date rule', () => {
  it('preserves imported sale dates when saleDate is mapped', () => {
    const importedDate = new Date(Date.UTC(2026, 7, 7));
    const rows = [
      row(2, { productName: 'Bread', quantity: 20, saleDate: importedDate }),
      row(3, { productName: 'Bun', quantity: 50, saleDate: importedDate }),
    ];

    const result = prepareSalesImport({
      rows,
      mapping: {
        columnMappings: [
          { sourceHeader: 'Product', targetField: 'productName' },
          { sourceHeader: 'Qty', targetField: 'quantity' },
          { sourceHeader: 'Date', targetField: 'saleDate' },
        ],
      },
      context: {},
    });

    expect(normalizedSaleDateToIso(result.rows[0]?.values['saleDate'])).toBe('2026-08-07');
    expect(result.rowProvenance.get(2)?.saleDate).toBe('imported');
    expect(result.summary.bulkSaleDateApplied).toBeUndefined();
  });

  it('rejects preparation when saleDate is not mapped and bulk date is missing', () => {
    expect(() =>
      prepareSalesImport({
        rows: [row(2, { productName: 'Bread', quantity: 20 })],
        mapping: {
          columnMappings: [
            { sourceHeader: 'Product', targetField: 'productName' },
            { sourceHeader: 'Qty', targetField: 'quantity' },
          ],
        },
        context: {},
      }),
    ).toThrow(ImportPreparationError);
  });

  it('applies bulk sale date to every row when saleDate is not mapped', () => {
    const result = prepareSalesImport({
      rows: [
        row(2, { productName: 'Bread', quantity: 20 }),
        row(3, { productName: 'Bun', quantity: 50 }),
        row(4, { productName: 'Cake', quantity: 5 }),
      ],
      mapping: {
        columnMappings: [
          { sourceHeader: 'Product', targetField: 'productName' },
          { sourceHeader: 'Qty', targetField: 'quantity' },
        ],
      },
      context: { bulkSaleDate: '2026-08-08' },
    });

    expect(result.rows.every((entry) => normalizedSaleDateToIso(entry.values['saleDate']) === '2026-08-08')).toBe(
      true,
    );
    expect(result.summary.bulkSaleDateApplied).toEqual({
      value: '2026-08-08',
      source: 'user_entered',
      rowCount: 3,
    });
    expect(result.rowProvenance.get(2)?.saleDate).toBe('user_entered');
    expect(result.rowProvenance.get(4)?.saleDate).toBe('user_entered');
  });

  it('does not overwrite imported dates when saleDate column is mapped', () => {
    const result = prepareSalesImport({
      rows: [row(2, { productName: 'Bread', quantity: 20, saleDate: new Date(Date.UTC(2026, 7, 7)) })],
      mapping: {
        columnMappings: [
          { sourceHeader: 'Product', targetField: 'productName' },
          { sourceHeader: 'Qty', targetField: 'quantity' },
          { sourceHeader: 'Date', targetField: 'saleDate' },
        ],
      },
      context: { bulkSaleDate: '2026-08-08' },
    });

    expect(normalizedSaleDateToIso(result.rows[0]?.values['saleDate'])).toBe('2026-08-07');
  });
});

describe('prepareSalesImport — money semantics rule', () => {
  const baseMapping = {
    columnMappings: [
      { sourceHeader: 'Product', targetField: 'productName' },
      { sourceHeader: 'Qty', targetField: 'quantity' },
    ],
  };

  it('Format A: derives line total from unit price and quantity', () => {
    const result = prepareSalesImport({
      rows: [row(2, { productName: 'Bread', quantity: 100, sellingPrice: 45 })],
      mapping: {
        ...baseMapping,
        columnMappings: [
          ...baseMapping.columnMappings,
          { sourceHeader: 'Rate', targetField: 'sellingPrice' },
        ],
      },
      context: { bulkSaleDate: '2026-08-08' },
    });

    expect(result.rows[0]?.values['sellingPrice']).toBe(45);
    expect(result.rows[0]?.values['amount']).toBe(4500);
    expect(result.rowProvenance.get(2)?.sellingPrice).toBe('imported');
    expect(result.rowProvenance.get(2)?.amount).toBe('derived');
  });

  it('Format B: derives unit price from line total and preserves historical amount', () => {
    const result = prepareSalesImport({
      rows: [row(2, { productName: 'Bread', quantity: 100, amount: 4500 })],
      mapping: {
        ...baseMapping,
        columnMappings: [
          ...baseMapping.columnMappings,
          { sourceHeader: 'Net Amount', targetField: 'amount' },
        ],
      },
      context: { bulkSaleDate: '2026-08-08' },
    });

    expect(result.rows[0]?.values['amount']).toBe(4500);
    expect(result.rows[0]?.values['sellingPrice']).toBe(45);
    expect(result.rowProvenance.get(2)?.amount).toBe('imported');
    expect(result.rowProvenance.get(2)?.sellingPrice).toBe('derived');
  });

  it('Format C: accepts consistent rate and amount', () => {
    const result = prepareSalesImport({
      rows: [row(2, { productName: 'Bread', quantity: 100, sellingPrice: 45, amount: 4500 })],
      mapping: {
        ...baseMapping,
        columnMappings: [
          ...baseMapping.columnMappings,
          { sourceHeader: 'Rate', targetField: 'sellingPrice' },
          { sourceHeader: 'Amount', targetField: 'amount' },
        ],
      },
      context: { bulkSaleDate: '2026-08-08' },
    });

    expect(result.rowBlockingErrors.size).toBe(0);
    expect(result.rows[0]?.values['sellingPrice']).toBe(45);
    expect(result.rows[0]?.values['amount']).toBe(4500);
  });

  it('Format C: blocks inconsistent rate and amount', () => {
    const result = prepareSalesImport({
      rows: [row(2, { productName: 'Bread', quantity: 100, sellingPrice: 45, amount: 5000 })],
      mapping: {
        ...baseMapping,
        columnMappings: [
          ...baseMapping.columnMappings,
          { sourceHeader: 'Rate', targetField: 'sellingPrice' },
          { sourceHeader: 'Amount', targetField: 'amount' },
        ],
      },
      context: { bulkSaleDate: '2026-08-08' },
    });

    expect(result.rowBlockingErrors.get(2)?.code).toBe('MONEY_INCONSISTENT_RATE_AMOUNT');
    expect(result.rowBlockingErrors.get(2)?.message).toContain('≠');
  });

  it('blocks zero quantity with non-zero line total', () => {
    const result = prepareSalesImport({
      rows: [row(2, { productName: 'Bread', quantity: 0, amount: 4500 })],
      mapping: {
        ...baseMapping,
        columnMappings: [
          ...baseMapping.columnMappings,
          { sourceHeader: 'Net Amount', targetField: 'amount' },
        ],
      },
      context: { bulkSaleDate: '2026-08-08' },
    });

    expect(result.rowBlockingErrors.get(2)?.code).toBe('MONEY_ZERO_QUANTITY_WITH_AMOUNT');
    expect(result.rows[0]?.values['sellingPrice']).toBeUndefined();
  });

  it('supports decimal quantity when deriving unit price', () => {
    const result = prepareSalesImport({
      rows: [row(2, { productName: 'Bread', quantity: 2.5, amount: 100 })],
      mapping: {
        ...baseMapping,
        columnMappings: [
          ...baseMapping.columnMappings,
          { sourceHeader: 'Net Amount', targetField: 'amount' },
        ],
      },
      context: { bulkSaleDate: '2026-08-08' },
    });

    expect(result.rows[0]?.values['amount']).toBe(100);
    expect(result.rows[0]?.values['sellingPrice']).toBe(40);
  });
});

describe('prepareSalesImport — customer rule', () => {
  const baseMapping = {
    columnMappings: [
      { sourceHeader: 'Product', targetField: 'productName' },
      { sourceHeader: 'Qty', targetField: 'quantity' },
      { sourceHeader: 'Date', targetField: 'saleDate' },
    ],
  };

  it('preserves imported customer names', () => {
    const result = prepareSalesImport({
      rows: [row(2, { productName: 'Bread', quantity: 1, saleDate: new Date(Date.UTC(2026, 7, 8)), customerName: 'Kabeer Bakery' })],
      mapping: {
        ...baseMapping,
        columnMappings: [
          ...baseMapping.columnMappings,
          { sourceHeader: 'Customer', targetField: 'customerName' },
        ],
      },
      context: {},
    });

    expect(result.rows[0]?.values['customerName']).toBe('Kabeer Bakery');
    expect(result.rowProvenance.get(2)?.customerName).toBe('imported');
    expect(result.rowBlockingErrors.size).toBe(0);
  });

  it('defaults missing customer to null walk-in representation', () => {
    const result = prepareSalesImport({
      rows: [row(2, { productName: 'Bread', quantity: 1, saleDate: new Date(Date.UTC(2026, 7, 8)) })],
      mapping: baseMapping,
      context: {},
    });

    expect(result.rows[0]?.values['customerName']).toBeNull();
    expect(result.rowProvenance.get(2)?.customerName).toBe('defaulted');
    expect(result.rowBlockingErrors.size).toBe(0);
  });

  it('treats blank customer values as missing walk-in sales', () => {
    const result = prepareSalesImport({
      rows: [
        row(2, {
          productName: 'Bread',
          quantity: 1,
          saleDate: new Date(Date.UTC(2026, 7, 8)),
          customerName: '   ',
        }),
      ],
      mapping: {
        ...baseMapping,
        columnMappings: [
          ...baseMapping.columnMappings,
          { sourceHeader: 'Customer', targetField: 'customerName' },
        ],
      },
      context: {},
    });

    expect(result.rows[0]?.values['customerName']).toBeNull();
    expect(result.rowProvenance.get(2)?.customerName).toBe('defaulted');
  });
});

describe('prepareSalesImport — sale number rule', () => {
  const baseMapping = {
    columnMappings: [
      { sourceHeader: 'Product', targetField: 'productName' },
      { sourceHeader: 'Qty', targetField: 'quantity' },
      { sourceHeader: 'Date', targetField: 'saleDate' },
    ],
  };

  it('preserves imported invoice numbers with trimmed whitespace', () => {
    const result = prepareSalesImport({
      rows: [
        row(2, {
          productName: 'Bread',
          quantity: 1,
          saleDate: new Date(Date.UTC(2026, 7, 8)),
          saleNumber: '  INV-1234  ',
        }),
      ],
      mapping: {
        ...baseMapping,
        columnMappings: [
          ...baseMapping.columnMappings,
          { sourceHeader: 'Invoice No', targetField: 'saleNumber' },
        ],
      },
      context: {},
    });

    expect(result.rows[0]?.values['saleNumber']).toBe('INV-1234');
    expect(result.rowProvenance.get(2)?.saleNumber).toBe('imported');
    expect(result.rowWarnings.has(2)).toBe(false);
    expect(result.rowBlockingErrors.size).toBe(0);
  });

  it('treats blank invoice values as missing', () => {
    const result = prepareSalesImport({
      rows: [
        row(2, {
          productName: 'Bread',
          quantity: 1,
          saleDate: new Date(Date.UTC(2026, 7, 8)),
          saleNumber: '   ',
        }),
      ],
      mapping: {
        ...baseMapping,
        columnMappings: [
          ...baseMapping.columnMappings,
          { sourceHeader: 'Invoice No', targetField: 'saleNumber' },
        ],
      },
      context: {},
    });

    expect(result.rows[0]?.values['saleNumber']).toBeNull();
    expect(result.rowProvenance.get(2)?.saleNumber).toBe('defaulted');
    expect(result.rowWarnings.get(2)?.code).toBe('MISSING_INVOICE_NUMBER');
  });

  it('defaults missing invoice to null without inventing a number', () => {
    const result = prepareSalesImport({
      rows: [row(2, { productName: 'Bread', quantity: 1, saleDate: new Date(Date.UTC(2026, 7, 8)) })],
      mapping: baseMapping,
      context: {},
    });

    expect(result.rows[0]?.values['saleNumber']).toBeNull();
    expect(result.rowProvenance.get(2)?.saleNumber).toBe('defaulted');
    expect(result.rowBlockingErrors.size).toBe(0);
    expect(String(result.rows[0]?.values['saleNumber'] ?? '')).not.toMatch(/^INV-/);
    expect(String(result.rows[0]?.values['saleNumber'] ?? '')).not.toMatch(/^IMPORT-/);
  });
});
