/**
 * Header Detection tests — generic scoring across product and sale
 * column definitions, including preamble-heavy vendor-shaped samples.
 */

import { describe, expect, it } from 'vitest';

import { PRODUCT_IMPORT_COLUMNS } from '@/lib/import/definitions/product.definition';
import { SALE_IMPORT_COLUMNS } from '@/lib/import/definitions/sale.definition';
import type { RawCellValue } from '@/lib/import/engine/types';
import {
  detectHeaderRow,
  normalizeHeaderLabel,
} from '@/lib/import/services/header-detection.service';
import {
  prepareImportFile,
  runImportFromParsed,
} from '@/lib/import/services/import.service';
import { buildAutoMapping } from '@/lib/import/services/auto-mapping';

function csvBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** myBillBook-style Sales Summary with preamble before the real header. */
const MYBILLBOOK_SALES_SUMMARY_CSV = [
  '7Days Bakery & Arabian Sweets',
  'Phone No: 7373229777',
  '',
  '',
  'Sales Summary Report',
  'Dated: 01/07/2026 - 31/07/2026',
  '7Days Bakery & Arabian Sweets',
  'Phone No: 7373229777',
  'Total Sales: 154673.0',
  '',
  '',
  'Invoice No,Invoice Date,Contact Name,Amount,Remaining Amount,Invoice Status,Due Date,Invoice Link,Payment Type,Party Category,po_number',
  '7B/SL/3245,01/07/2026,Safeer Bai,8439.0,0.0,Paid,08/07/2026,https://example.com,cash,,""',
  '7B/SL/3247,02/07/2026,Safeer Bai,9907.0,0.0,Paid,09/07/2026,https://example.com,cash,,""',
].join('\n');

/**
 * Vyapar-style Sale Report matrix (preamble + header + blank + data).
 * Mirrors the real export shape without hardcoding vendor logic in the service.
 */
const VYAPAR_SALE_REPORT_MATRIX: RawCellValue[][] = [
  ['Generated on Jul 23,2026 at 10:27 pm', null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [
    'Date',
    'Party Name',
    'Phone No.',
    "Party's GSTIN No.",
    'Order No.',
    'Invoice No.',
    'Transaction Type',
    'Total Amount',
    'Received Amount',
    'Balance Amount',
    'Description',
    'Cash',
  ],
  [null, null, null, null, null, null, null, null],
  ['04/06/2026', 'Masood', '', '', '', '1', 'Sale', '18.00', '0.00', '18.00', '', '0.00'],
];

describe('normalizeHeaderLabel', () => {
  it('trims, lowercases, collapses whitespace, and strips trailing punctuation', () => {
    expect(normalizeHeaderLabel('  Invoice No.  ')).toBe('invoice no');
    expect(normalizeHeaderLabel('Phone No:')).toBe('phone no');
    expect(normalizeHeaderLabel('Sale   Price')).toBe('sale price');
  });
});

describe('detectHeaderRow', () => {
  it('1. detects a simple Product CSV with header on the first row', () => {
    const matrix: RawCellValue[][] = [
      ['Product Name', 'Product Code', 'Selling Price', 'Unit'],
      ['Milk Bread', 'BRD-001', 45, 'pcs'],
      ['Chocolate Cake', 'CAK-002', 1250, 'pcs'],
    ];

    const result = detectHeaderRow(matrix, PRODUCT_IMPORT_COLUMNS);

    expect(result.headerRowIndex).toBe(0);
    expect(result.detectedHeaders).toEqual([
      'Product Name',
      'Product Code',
      'Selling Price',
      'Unit',
    ]);
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.scoreBreakdown.aliasMatches).toBeGreaterThanOrEqual(3);
    expect(result.scoreBreakdown.requiredFieldMatches).toBeGreaterThanOrEqual(1);
    expect(result.reasoning.length).toBeGreaterThan(0);
  });

  it('2. skips blank rows before the Product header', () => {
    const matrix: RawCellValue[][] = [
      [null, null, null],
      ['', '', ''],
      ['Item Name', 'Item Code', 'Sale Price'],
      ['Milk Bread', 'BRD-001', 45],
    ];

    const result = detectHeaderRow(matrix, PRODUCT_IMPORT_COLUMNS);

    expect(result.headerRowIndex).toBe(2);
    expect(result.detectedHeaders).toEqual(['Item Name', 'Item Code', 'Sale Price']);
    expect(result.confidence).toBeGreaterThan(0.4);
    expect(result.scoreBreakdown.aliasMatches).toBe(3);
  });

  it('3. detects the header row in a myBillBook-style Sales Summary sample', () => {
    // Parse via prepare path so CSV → matrix matches production.
    const prepared = prepareImportFile(
      csvBytes(MYBILLBOOK_SALES_SUMMARY_CSV),
      'sale',
      { fileName: 'sales-summary.csv' },
    );

    expect(prepared.headerDetection.headerRowIndex).toBe(11);
    expect(prepared.headerDetection.detectedHeaders[0]).toBe('Invoice No');
    expect(prepared.headerDetection.detectedHeaders).toContain('Invoice Date');
    expect(prepared.headerDetection.detectedHeaders).toContain('Amount');
    expect(prepared.headerDetection.confidence).toBeGreaterThan(0.25);
    expect(prepared.headerDetection.scoreBreakdown.aliasMatches).toBeGreaterThanOrEqual(2);
    expect(prepared.parsed.headers[0]).toBe('Invoice No');
  });

  it('4. detects the header row in a Vyapar-style Sale Report sample', () => {
    const result = detectHeaderRow(VYAPAR_SALE_REPORT_MATRIX, SALE_IMPORT_COLUMNS);

    expect(result.headerRowIndex).toBe(2);
    expect(result.detectedHeaders[0]).toBe('Date');
    expect(result.detectedHeaders).toContain('Party Name');
    // Trailing period on "Invoice No." is normalized for matching and
    // preserved (without the period suffix handling) in display via trim.
    expect(result.detectedHeaders).toContain('Invoice No.');
    expect(result.detectedHeaders).toContain('Description');
    expect(result.confidence).toBeGreaterThan(0.25);
    expect(result.scoreBreakdown.aliasMatches).toBeGreaterThanOrEqual(3);
    expect(result.reasoning.some((line) => line.includes('matrix row 2'))).toBe(true);
  });

  it('5. returns low confidence when no recognizable headers exist', () => {
    const matrix: RawCellValue[][] = [
      ['Hello World', 'Foo Bar', 'Baz'],
      ['alpha', 'beta', 'gamma'],
      ['1', '2', '3'],
    ];

    const result = detectHeaderRow(matrix, PRODUCT_IMPORT_COLUMNS);

    expect(result.headerRowIndex).toBeGreaterThanOrEqual(0);
    expect(result.scoreBreakdown.aliasMatches).toBe(0);
    expect(result.confidence).toBeLessThan(0.4);
    expect(result.reasoning.some((line) => /low confidence/i.test(line))).toBe(true);
  });

  it('6. selects the highest-confidence row when multiple candidates look like headers', () => {
    const matrix: RawCellValue[][] = [
      // Weak candidate: only one alias ("Date")
      ['Date', 'Misc A', 'Misc B', 'Misc C'],
      // Strong candidate: several product aliases + required name
      ['Product Name', 'Product Code', 'Selling Price', 'Category', 'Unit'],
      // Medium candidate: two aliases
      ['Item Name', 'SKU', 'Notes', 'Extra'],
      ['Bread', 'BRD-1', 40, 'Bread', 'pcs'],
    ];

    const result = detectHeaderRow(matrix, PRODUCT_IMPORT_COLUMNS);

    expect(result.headerRowIndex).toBe(1);
    expect(result.detectedHeaders).toEqual([
      'Product Name',
      'Product Code',
      'Selling Price',
      'Category',
      'Unit',
    ]);
    expect(result.scoreBreakdown.aliasMatches).toBeGreaterThanOrEqual(4);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('returns zero confidence when the scan window has only empty rows', () => {
    const matrix: RawCellValue[][] = [
      [null, null],
      ['', ''],
      [null, ''],
    ];

    const result = detectHeaderRow(matrix, SALE_IMPORT_COLUMNS);

    expect(result.headerRowIndex).toBe(-1);
    expect(result.detectedHeaders).toEqual([]);
    expect(result.confidence).toBe(0);
    expect(result.scoreBreakdown.totalScore).toBe(0);
  });

  it('penalizes duplicate header labels in the score breakdown', () => {
    const withDupes: RawCellValue[][] = [
      ['Product Name', 'Product Name', 'Selling Price'],
    ];
    const withoutDupes: RawCellValue[][] = [
      ['Product Name', 'Product Code', 'Selling Price'],
    ];

    const duped = detectHeaderRow(withDupes, PRODUCT_IMPORT_COLUMNS);
    const clean = detectHeaderRow(withoutDupes, PRODUCT_IMPORT_COLUMNS);

    expect(duped.scoreBreakdown.duplicateHeaderCount).toBeGreaterThan(0);
    expect(clean.scoreBreakdown.duplicateHeaderCount).toBe(0);
    expect(clean.scoreBreakdown.totalScore).toBeGreaterThan(duped.scoreBreakdown.totalScore);
  });

  it('matches Invoice No. to Invoice No via trailing-punctuation normalization', () => {
    const matrix: RawCellValue[][] = [
      ['Invoice No.', 'Invoice Date', 'Party Name', 'Quantity'],
      ['INV-1', '2026-01-01', 'Walk-in', 2],
    ];

    const result = detectHeaderRow(matrix, SALE_IMPORT_COLUMNS);

    expect(result.headerRowIndex).toBe(0);
    expect(result.scoreBreakdown.aliasMatches).toBeGreaterThanOrEqual(4);
    expect(result.scoreBreakdown.requiredFieldMatches).toBeGreaterThanOrEqual(2);
  });
});

describe('prepareImportFile (single-parse integration)', () => {
  it('keeps Product Import working for a clean first-row header CSV', () => {
    const csv = [
      'Product Name,Product Code,Selling Price,Unit',
      'Milk Bread,BRD-001,45,pcs',
      'Chocolate Cake,CAK-002,1250,pcs',
    ].join('\n');

    const { parsed, headerDetection } = prepareImportFile(csvBytes(csv), 'product', {
      fileName: 'products.csv',
    });

    expect(headerDetection.headerRowIndex).toBe(0);
    expect(parsed.headers).toEqual([
      'Product Name',
      'Product Code',
      'Selling Price',
      'Unit',
    ]);
    expect(parsed.rows).toHaveLength(2);

    const { mapping } = buildAutoMapping(parsed.headers, PRODUCT_IMPORT_COLUMNS);
    expect(mapping.columnMappings.length).toBeGreaterThanOrEqual(3);

    const report = runImportFromParsed(parsed, 'product', mapping);
    expect(report.result.summary.errorRows).toBe(0);
    expect(report.result.summary.validRows).toBe(2);
  });

  it('does not double-parse: ParsedFile is reused for mapping and pipeline', () => {
    const csv = 'Item Name,Sale Price\nBread,40\n';
    const prepared = prepareImportFile(csvBytes(csv), 'product', {
      fileName: 'items.csv',
    });

    const { mapping } = buildAutoMapping(
      prepared.parsed.headers,
      PRODUCT_IMPORT_COLUMNS,
    );
    const report = runImportFromParsed(prepared.parsed, 'product', mapping);

    expect(report.headers).toBe(prepared.parsed.headers);
    expect(report.sheetName).toBe(prepared.parsed.sheetName);
  });
});
