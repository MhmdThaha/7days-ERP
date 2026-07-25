/**
 * Integration tests for the Import Orchestration Service.
 *
 * Runs the COMPLETE pipeline (parse → map → normalize → validate) through
 * runImport() with realistic bakery spreadsheets, exactly as the upload
 * UI will call it in later phases.
 */

import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { PRODUCT_IMPORT_COLUMNS, PRODUCT_ISSUE_CODES } from '@/lib/import/definitions/product.definition';
import { ISSUE_CODES, type MappingConfig } from '@/lib/import/engine/types';
import { detectProductImportConflicts } from '@/lib/import/services/conflict.service';
import { runImport } from '@/lib/import/services/import.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function csvBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function xlsxBytes(rows: unknown[][]): Uint8Array {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Items');

  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

function xlsxWithFormulas(
  rows: unknown[][],
  attachFormulas: (sheet: XLSX.WorkSheet) => void,
): Uint8Array {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  attachFormulas(sheet);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Items');

  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

const productNamePriceMapping: MappingConfig = {
  columnMappings: [
    { sourceHeader: 'Product Name', targetField: 'name' },
    { sourceHeader: 'Selling Price', targetField: 'sellingPrice' },
  ],
};

/** Explicit mapping for a Vyapar-style item export. */
const vyaparMapping: MappingConfig = {
  columnMappings: [
    { sourceHeader: 'Item Name', targetField: 'name' },
    { sourceHeader: 'Item Code', targetField: 'code' },
    { sourceHeader: 'Category', targetField: 'category' },
    { sourceHeader: 'Unit', targetField: 'unit' },
    { sourceHeader: 'Sale Price', targetField: 'sellingPrice' },
    { sourceHeader: 'Purchase Price', targetField: 'costPrice' },
    { sourceHeader: 'GST %', targetField: 'gstRate' },
    { sourceHeader: 'Stock', targetField: 'openingStock' },
    { sourceHeader: 'Min Stock', targetField: 'minimumStock' },
  ],
};

const vyaparCsv = [
  'Item Name,Item Code,Category,Unit,Sale Price,Purchase Price,GST %,Stock,Min Stock',
  'Milk Bread,BRD-001,Bread,pcs,"₹45","₹22",5%,120,20',
  'Chocolate Cake,CAK-002,Cake,pcs,"₹1,250","₹640",18%,8,2',
  'Veg Puff,PUF-003,Savory,pcs,"₹25","₹11",5%,60,15',
].join('\n');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runImport (integration)', () => {
  it('imports a clean Vyapar-style CSV: every row valid, values normalized', () => {
    const report = runImport({
      data: csvBytes(vyaparCsv),
      fileName: 'vyapar-items.csv',
      entityType: 'product',
      mapping: vyaparMapping,
    });

    expect(report.missingRequiredFields).toEqual([]);
    expect(report.missingSourceHeaders).toEqual([]);
    expect(report.result.summary).toEqual({
      totalRows: 3,
      validRows: 3,
      warningRows: 0,
      errorRows: 0,
    });

    // Currency, grouping, and percent forms are normalized to numbers.
    const cake = report.result.rows[1];

    expect(cake?.rowNumber).toBe(3);
    expect(cake?.values).toMatchObject({
      name: 'Chocolate Cake',
      code: 'CAK-002',
      sellingPrice: 1250,
      costPrice: 640,
      gstRate: 18,
      openingStock: 8,
      minimumStock: 2,
    });
  });

  it('imports a realistic XLSX with native numbers and reports ignored columns', () => {
    const report = runImport({
      data: xlsxBytes([
        ['Item Name', 'Sale Price', 'GST %', 'Stock', 'HSN'],
        ['Milk Bread', 45, 5, 120, '1905'],
        ['Rusk Toast', 60, 5, 40, '1905'],
      ]),
      fileName: 'items.xlsx',
      entityType: 'product',
      mapping: {
        columnMappings: [
          { sourceHeader: 'Item Name', targetField: 'name' },
          { sourceHeader: 'Sale Price', targetField: 'sellingPrice' },
          { sourceHeader: 'GST %', targetField: 'gstRate' },
          { sourceHeader: 'Stock', targetField: 'openingStock' },
        ],
      },
    });

    expect(report.sheetName).toBe('Items');
    expect(report.ignoredHeaders).toEqual(['HSN']);
    expect(report.result.summary.validRows).toBe(2);
    expect(report.result.rows[0]?.values).toMatchObject({
      name: 'Milk Bread',
      sellingPrice: 45,
      gstRate: 5,
      openingStock: 120,
    });
  });

  it('reports a missing required field when no column maps to Product Name', () => {
    const report = runImport({
      data: csvBytes('Sale Price,Stock\n45,120\n'),
      fileName: 'no-names.csv',
      entityType: 'product',
      mapping: {
        columnMappings: [
          { sourceHeader: 'Sale Price', targetField: 'sellingPrice' },
          { sourceHeader: 'Stock', targetField: 'openingStock' },
        ],
      },
    });

    expect(report.missingRequiredFields).toEqual(['name']);
    // Rows also fail row-level validation since "name" is empty everywhere.
    expect(report.result.rows[0]?.issues).toContainEqual(
      expect.objectContaining({
        code: ISSUE_CODES.REQUIRED_FIELD_MISSING,
        field: 'name',
      }),
    );
  });

  it('flags a zero selling price via the product business rule', () => {
    const report = runImport({
      data: csvBytes('Item Name,Sale Price\nFree Sample Bun,0\n'),
      fileName: 'items.csv',
      entityType: 'product',
      mapping: {
        columnMappings: [
          { sourceHeader: 'Item Name', targetField: 'name' },
          { sourceHeader: 'Sale Price', targetField: 'sellingPrice' },
        ],
      },
    });

    expect(report.result.rows[0]?.status).toBe('error');
    expect(report.result.rows[0]?.issues).toContainEqual(
      expect.objectContaining({
        code: PRODUCT_ISSUE_CODES.NON_POSITIVE_SELLING_PRICE,
        field: 'sellingPrice',
      }),
    );
  });

  it('rejects a GST rate outside the Indian slabs', () => {
    const report = runImport({
      data: csvBytes('Item Name,GST %\nMilk Bread,15%\n'),
      fileName: 'items.csv',
      entityType: 'product',
      mapping: {
        columnMappings: [
          { sourceHeader: 'Item Name', targetField: 'name' },
          { sourceHeader: 'GST %', targetField: 'gstRate' },
        ],
      },
    });

    expect(report.result.rows[0]?.status).toBe('error');
    expect(report.result.rows[0]?.issues).toContainEqual(
      expect.objectContaining({
        code: ISSUE_CODES.VALUE_NOT_ALLOWED,
        field: 'gstRate',
      }),
    );
  });

  it('collects messy-data problems as issues without throwing', () => {
    const report = runImport({
      data: csvBytes(
        [
          'Item Name,Sale Price,Stock',
          'Milk Bread,forty five,120', // bad price text → warning + null
          ',45,10', // missing name → error
          'Veg Puff,25,-3', // negative stock → business-rule error
        ].join('\n'),
      ),
      fileName: 'messy.csv',
      entityType: 'product',
      mapping: {
        columnMappings: [
          { sourceHeader: 'Item Name', targetField: 'name' },
          { sourceHeader: 'Sale Price', targetField: 'sellingPrice' },
          { sourceHeader: 'Stock', targetField: 'openingStock' },
        ],
      },
    });

    expect(report.result.summary).toEqual({
      totalRows: 3,
      validRows: 0,
      warningRows: 1,
      errorRows: 2,
    });

    expect(report.result.rows[0]?.issues).toContainEqual(
      expect.objectContaining({ code: ISSUE_CODES.INVALID_NUMBER }),
    );
    expect(report.result.rows[2]?.issues).toContainEqual(
      expect.objectContaining({ code: PRODUCT_ISSUE_CODES.NEGATIVE_AMOUNT }),
    );
  });

  it('throws a typed engine error for a file that is not a spreadsheet', () => {
    expect(() =>
      runImport({
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46]), // "%PDF"
        fileName: 'products.xlsx',
        entityType: 'product',
        mapping: vyaparMapping,
      }),
    ).toThrowError(
      expect.objectContaining({ name: 'ImportEngineError', code: 'PARSE_FAILED' }),
    );
  });

  it('flags whitespace-only product names as missing required field', () => {
    const report = runImport({
      data: csvBytes('Item Name,Sale Price\n   ,45\n'),
      fileName: 'items.csv',
      entityType: 'product',
      mapping: {
        columnMappings: [
          { sourceHeader: 'Item Name', targetField: 'name' },
          { sourceHeader: 'Sale Price', targetField: 'sellingPrice' },
        ],
      },
    });

    expect(report.result.rows[0]?.status).toBe('error');
    expect(report.result.rows[0]?.issues).toContainEqual(
      expect.objectContaining({
        code: ISSUE_CODES.REQUIRED_FIELD_MISSING,
        field: 'name',
      }),
    );
  });

  it('accepts unicode and emoji product names when otherwise valid', () => {
    const report = runImport({
      data: csvBytes('Item Name,Sale Price\nNaan 🥖,45\nCafé Croissant,60\n'),
      fileName: 'items.csv',
      entityType: 'product',
      mapping: {
        columnMappings: [
          { sourceHeader: 'Item Name', targetField: 'name' },
          { sourceHeader: 'Sale Price', targetField: 'sellingPrice' },
        ],
      },
    });

    expect(report.result.summary.validRows).toBe(2);
    expect(report.result.rows[0]?.values['name']).toBe('Naan 🥖');
    expect(report.result.rows[1]?.values['name']).toBe('Café Croissant');
  });

  it('treats mixed-case and padded identical rows as exact duplicates in conflict detection', () => {
    const report = runImport({
      data: csvBytes('Item Name,Sale Price\n  MILK BREAD  ,45\nmilk bread,45\n'),
      fileName: 'items.csv',
      entityType: 'product',
      mapping: {
        columnMappings: [
          { sourceHeader: 'Item Name', targetField: 'name' },
          { sourceHeader: 'Sale Price', targetField: 'sellingPrice' },
        ],
      },
    });

    const conflicts = detectProductImportConflicts(report);
    expect(conflicts.summary.exactDuplicateRowCount).toBe(1);
    expect(conflicts.summary.conflictingDuplicateRowCount).toBe(0);
    expect(conflicts.cleanRows).toEqual([2]);
  });

  it.each([
    ['Bread', 'Bread '],
    ['Bread\t', 'Bread'],
    ['Bread   ', 'Bread'],
    [' Bread', 'Bread'],
    ['Bread ', 'Bread'],
  ])(
    'normalizes invisible whitespace in product names through the full pipeline (%#)',
    (nameA, nameB) => {
      const report = runImport({
        data: csvBytes(`Item Name,Sale Price\n${nameA},45\n${nameB},45\n`),
        fileName: 'items.csv',
        entityType: 'product',
        mapping: {
          columnMappings: [
            { sourceHeader: 'Item Name', targetField: 'name' },
            { sourceHeader: 'Sale Price', targetField: 'sellingPrice' },
          ],
        },
      });

      expect(report.result.rows[0]?.values.name).toBe('Bread');
      expect(report.result.rows[1]?.values.name).toBe('Bread');

      const conflicts = detectProductImportConflicts(report);
      expect(conflicts.summary.exactDuplicateRowCount).toBe(1);
      expect(conflicts.summary.conflictingDuplicateRowCount).toBe(0);
      expect(conflicts.cleanRows).toEqual([2]);
      expect(conflicts.exactDuplicateRows).toHaveLength(1);
      expect(conflicts.duplicateRowsInFile).toEqual([]);
    },
  );

  describe('Excel formula cells through the full pipeline', () => {
    function importFormulaWorkbook(attachFormulas: (sheet: XLSX.WorkSheet) => void) {
      return runImport({
        data: xlsxWithFormulas(
          [['Product Name', 'Selling Price'], ['Bread', null]],
          attachFormulas,
        ),
        fileName: 'items.xlsx',
        entityType: 'product',
        mapping: productNamePriceMapping,
      });
    }

    it('imports a numeric formula cached value through normalize and validate', () => {
      const report = importFormulaWorkbook((sheet) => {
        sheet['C2'] = { t: 'n', v: 40 };
        sheet['D2'] = { t: 'n', v: 5 };
        sheet['B2'] = { t: 'n', f: 'C2+D2', v: 45 };
      });

      expect(report.result.rows).toHaveLength(1);
      expect(report.result.rows[0]?.values).toEqual({
        name: 'Bread',
        sellingPrice: 45,
      });
      expect(report.result.rows[0]?.status).toBe('valid');
    });

    it('imports a text formula cached value for the product name', () => {
      const report = importFormulaWorkbook((sheet) => {
        sheet['A2'] = { t: 's', f: 'CONCATENATE("Bro","ad")', v: 'Bread' };
        sheet['B2'] = { t: 'n', v: 45 };
      });

      expect(report.result.rows[0]?.values.name).toBe('Bread');
      expect(report.result.rows[0]?.status).toBe('valid');
    });

    it('treats a blank formula result as an empty optional selling price', () => {
      const report = importFormulaWorkbook((sheet) => {
        sheet['B2'] = { t: 's', f: '=""', v: '' };
      });

      expect(report.result.rows[0]?.values).toEqual({
        name: 'Bread',
        sellingPrice: null,
      });
      expect(report.result.rows[0]?.status).toBe('valid');
    });

    it('treats formula error cells as empty optional values, not formula text', () => {
      const valueReport = importFormulaWorkbook((sheet) => {
        sheet['B2'] = { t: 'e', f: 'SQRT(-1)', v: 15, w: '#VALUE!' };
      });
      const divReport = importFormulaWorkbook((sheet) => {
        sheet['B2'] = { t: 'e', f: '1/0', v: 7, w: '#DIV/0!' };
      });

      for (const report of [valueReport, divReport]) {
        expect(report.result.rows[0]?.values.sellingPrice).toBeNull();
        expect(report.result.rows[0]?.status).toBe('valid');
        expect(report.result.rows[0]?.issues).toEqual([]);
      }
    });
  });

  it('resolves vendor headers to fields via the definition synonyms', () => {
    // Simulate the future auto-mapper: build the MappingConfig purely from
    // the synonyms declared on the Product Definition. This proves the
    // synonym data actually covers Vyapar-style headers end to end.
    const vendorHeaders = ['Item Name', 'Sale Price', 'Qty'];

    const columnMappings = vendorHeaders.flatMap((header) => {
      const match = PRODUCT_IMPORT_COLUMNS.find((column) =>
        column.synonyms?.some(
          (synonym) => synonym.toLowerCase() === header.toLowerCase(),
        ),
      );

      return match ? [{ sourceHeader: header, targetField: match.field }] : [];
    });

    // Every vendor header found a target field through synonyms alone.
    expect(columnMappings).toEqual([
      { sourceHeader: 'Item Name', targetField: 'name' },
      { sourceHeader: 'Sale Price', targetField: 'sellingPrice' },
      { sourceHeader: 'Qty', targetField: 'openingStock' },
    ]);

    const report = runImport({
      data: csvBytes('Item Name,Sale Price,Qty\nMilk Bread,"₹45",120\n'),
      fileName: 'vyapar.csv',
      entityType: 'product',
      mapping: { columnMappings },
    });

    expect(report.result.summary.validRows).toBe(1);
    expect(report.result.rows[0]?.values).toMatchObject({
      name: 'Milk Bread',
      sellingPrice: 45,
      openingStock: 120,
    });
  });
});
