/**
 * Sale import definition — engine integration smoke tests.
 */

import { describe, expect, it } from 'vitest';

import {
  SALE_IMPORT_COLUMNS,
  SALE_ISSUE_CODES,
  saleImportDefinition,
} from '@/lib/import/definitions/sale.definition';
import { getImportDefinition } from '@/lib/import/definitions';
import { ISSUE_CODES, type MappingConfig } from '@/lib/import/engine/types';
import { runImport } from '@/lib/import/services/import.service';

function csvBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const saleLineMapping: MappingConfig = {
  columnMappings: [
    { sourceHeader: 'Sale Date', targetField: 'saleDate' },
    { sourceHeader: 'Product Name', targetField: 'productName' },
    { sourceHeader: 'Quantity', targetField: 'quantity' },
    { sourceHeader: 'Rate', targetField: 'sellingPrice' },
  ],
};

describe('saleImportDefinition', () => {
  it('is registered in the import definitions registry', () => {
    expect(getImportDefinition('sale')).toBe(saleImportDefinition);
    expect(saleImportDefinition.entityType).toBe('sale');
    expect(saleImportDefinition.label).toBe('Sales');
    expect(SALE_IMPORT_COLUMNS.length).toBeGreaterThan(0);
  });

  it('runs through the generic import engine for a valid flat sales row', () => {
    const report = runImport({
      data: csvBytes(
        'Sale Date,Product Name,Quantity,Rate\n2026-03-15,Milk Bread,2,45\n',
      ),
      fileName: 'sales.csv',
      entityType: 'sale',
      mapping: saleLineMapping,
    });

    expect(report.entityType).toBe('sale');
    expect(report.missingRequiredFields).toEqual([]);
    expect(report.result.summary).toEqual({
      totalRows: 1,
      validRows: 1,
      warningRows: 0,
      errorRows: 0,
    });
    expect(report.result.rows[0]?.values.productName).toBe('Milk Bread');
    expect(report.result.rows[0]?.values.quantity).toBe(2);
    expect(report.result.rows[0]?.values.sellingPrice).toBe(45);
  });

  it('requires product name or product code on each row', () => {
    const report = runImport({
      data: csvBytes('Sale Date,Quantity\n2026-03-15,2\n'),
      fileName: 'sales.csv',
      entityType: 'sale',
      mapping: {
        columnMappings: [
          { sourceHeader: 'Sale Date', targetField: 'saleDate' },
          { sourceHeader: 'Quantity', targetField: 'quantity' },
        ],
      },
    });

    expect(report.result.rows[0]?.status).toBe('error');
    expect(report.result.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: SALE_ISSUE_CODES.PRODUCT_REFERENCE_REQUIRED }),
      ]),
    );
  });

  it('accepts product code without product name', () => {
    const report = runImport({
      data: csvBytes('Sale Date,Item Code,Quantity\n2026-03-15,BRD-001,3\n'),
      fileName: 'sales.csv',
      entityType: 'sale',
      mapping: {
        columnMappings: [
          { sourceHeader: 'Sale Date', targetField: 'saleDate' },
          { sourceHeader: 'Item Code', targetField: 'productCode' },
          { sourceHeader: 'Quantity', targetField: 'quantity' },
        ],
      },
    });

    expect(report.result.rows[0]?.status).toBe('valid');
    expect(report.result.rows[0]?.values.productCode).toBe('BRD-001');
  });

  it('flags missing required sale date', () => {
    const report = runImport({
      data: csvBytes('Product Name,Quantity\nMilk Bread,1\n'),
      fileName: 'sales.csv',
      entityType: 'sale',
      mapping: {
        columnMappings: [
          { sourceHeader: 'Product Name', targetField: 'productName' },
          { sourceHeader: 'Quantity', targetField: 'quantity' },
        ],
      },
    });

    expect(report.missingRequiredFields).toContain('saleDate');
    expect(report.result.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: ISSUE_CODES.REQUIRED_FIELD_MISSING, field: 'saleDate' }),
      ]),
    );
  });
});
