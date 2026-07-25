/**
 * Parser tests — protect file reading, header detection, and (critically)
 * the original-spreadsheet row numbers that every error message relies on.
 */

import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { parseImportFile } from '@/lib/import/engine/parser';
import { ImportEngineError } from '@/lib/import/engine/types';

/** Builds CSV bytes from a raw string. */
function csvBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Builds real .xlsx bytes from an array-of-arrays. */
function xlsxBytes(rows: unknown[][]): Uint8Array {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');

  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

/** Builds .xlsx bytes and lets the caller attach formula cells before write. */
function xlsxWithFormulas(
  rows: unknown[][],
  attachFormulas: (sheet: XLSX.WorkSheet) => void,
  sheetName = 'Sheet1',
): Uint8Array {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  attachFormulas(sheet);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);

  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

describe('parseImportFile', () => {
  it('reads a valid CSV with headers and data rows', () => {
    const parsed = parseImportFile(
      csvBytes('Name,Price\nBread,40\nCake,250\n'),
      { fileName: 'products.csv' },
    );

    expect(parsed.headers).toEqual(['Name', 'Price']);
    expect(parsed.rows).toHaveLength(2);
    // CSV cells are intentionally NOT type-inferred by the parser; the
    // normalizer stage owns all value coercion.
    expect(parsed.rows[0]?.cells).toEqual({ Name: 'Bread', Price: '40' });
    expect(parsed.rows[1]?.cells).toEqual({ Name: 'Cake', Price: '250' });
  });

  it('reads a valid XLSX with headers and data rows', () => {
    const parsed = parseImportFile(
      xlsxBytes([
        ['Name', 'Price'],
        ['Bread', 40],
      ]),
      { fileName: 'products.xlsx' },
    );

    expect(parsed.sheetName).toBe('Sheet1');
    expect(parsed.headers).toEqual(['Name', 'Price']);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.cells).toEqual({ Name: 'Bread', Price: 40 });
  });

  it('uses the first non-empty row as headers and de-duplicates labels', () => {
    const parsed = parseImportFile(
      csvBytes(',,\nName,Qty,Qty\nBread,5,6\n'),
    );

    // Row 1 is blank, so row 2 becomes the header row; the duplicate "Qty"
    // gets a numbered suffix so no cell value can be silently overwritten.
    expect(parsed.headers).toEqual(['Name', 'Qty', 'Qty (2)']);
    expect(parsed.rows[0]?.cells).toEqual({ Name: 'Bread', Qty: '5', 'Qty (2)': '6' });
  });

  it('preserves original spreadsheet row numbers across blank rows', () => {
    const parsed = parseImportFile(
      csvBytes('Name,Price\nBread,40\n,\nCake,250\n'),
    );

    // Header is spreadsheet row 1; the blank row 3 is skipped but row
    // numbers still match what the user sees in Excel.
    expect(parsed.rows.map((row) => row.rowNumber)).toEqual([2, 4]);
    expect(parsed.skippedEmptyRowCount).toBe(1);
  });

  it('rejects unsupported file types by extension', () => {
    expect(() =>
      parseImportFile(csvBytes('a,b\n1,2\n'), { fileName: 'report.pdf' }),
    ).toThrowError(
      expect.objectContaining({
        name: 'ImportEngineError',
        code: 'UNSUPPORTED_FILE_TYPE',
      }),
    );
  });

  it('rejects a sheet with no usable header row', () => {
    let thrown: unknown;

    try {
      parseImportFile(xlsxBytes([['', ''], ['', '']]));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ImportEngineError);
    expect((thrown as ImportEngineError).code).toMatch(/NO_HEADER_ROW|EMPTY_FILE/);
  });

  it('rejects bytes that are not a spreadsheet', () => {
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03]);

    expect(() => parseImportFile(garbage, { fileName: 'data.xlsx' })).toThrowError(
      expect.objectContaining({ name: 'ImportEngineError' }),
    );
  });

  describe('Excel formula cells', () => {
    const productHeaders = ['Product Name', 'Selling Price'] as const;

    it('reads the cached calculated value for a numeric formula, not the formula text', () => {
      const parsed = parseImportFile(
        xlsxWithFormulas(
          [productHeaders, ['Bread', null]],
          (sheet) => {
            // Simulates =C2+D2 where Base=40 and Markup=5; Excel stores v:45.
            sheet['C2'] = { t: 'n', v: 40 };
            sheet['D2'] = { t: 'n', v: 5 };
            sheet['B2'] = { t: 'n', f: 'C2+D2', v: 45 };
          },
        ),
        { fileName: 'products.xlsx' },
      );

      const price = parsed.rows[0]?.cells['Selling Price'];
      expect(price).toBe(45);
      expect(typeof price).toBe('number');
    });

    it('reads the cached calculated value for a text formula', () => {
      const parsed = parseImportFile(
        xlsxWithFormulas([productHeaders, [null, 45]], (sheet) => {
          sheet['A2'] = { t: 's', f: 'CONCATENATE("Bro","ad")', v: 'Bread' };
        }),
        { fileName: 'products.xlsx' },
      );

      expect(parsed.rows[0]?.cells['Product Name']).toBe('Bread');
    });

    it('reads a blank formula result as empty string', () => {
      const parsed = parseImportFile(
        xlsxWithFormulas([productHeaders, ['Bread', null]], (sheet) => {
          sheet['B2'] = { t: 's', f: '=""', v: '' };
        }),
        { fileName: 'products.xlsx' },
      );

      expect(parsed.rows[0]?.cells['Selling Price']).toBe('');
    });

    it('treats formula error cells as null rather than formula text', () => {
      const valueError = parseImportFile(
        xlsxWithFormulas([productHeaders, ['Bread', null]], (sheet) => {
          sheet['B2'] = { t: 'e', f: 'SQRT(-1)', v: 15, w: '#VALUE!' };
        }),
        { fileName: 'products.xlsx' },
      );
      const divError = parseImportFile(
        xlsxWithFormulas([productHeaders, ['Bread', null]], (sheet) => {
          sheet['B2'] = { t: 'e', f: '1/0', v: 7, w: '#DIV/0!' };
        }),
        { fileName: 'products.xlsx' },
      );

      expect(valueError.rows[0]?.cells['Selling Price']).toBeNull();
      expect(divError.rows[0]?.cells['Selling Price']).toBeNull();
    });

    it('returns null when a formula cell has no cached value (Excel must recalculate before export)', () => {
      const parsed = parseImportFile(
        xlsxWithFormulas([productHeaders, ['Bread', null]], (sheet) => {
          sheet['B2'] = { t: 'n', f: '40+5' };
        }),
        { fileName: 'products.xlsx' },
      );

      // SheetJS does not evaluate formulas; without Excel's cached v, the cell is empty.
      expect(parsed.rows[0]?.cells['Selling Price']).toBeNull();
    });
  });
});
