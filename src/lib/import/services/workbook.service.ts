/**
 * Workbook metadata helper for the import wizard.
 *
 * Reads ONLY the sheet-name list from an uploaded file (bookSheets: true
 * skips all cell data), so the wizard can offer sheet selection before
 * the real pipeline runs. Not a parser: row parsing stays exclusively in
 * the engine's parser.ts.
 */

import * as XLSX from 'xlsx';

import { ImportEngineError } from '@/lib/import/engine/types';

export function listSheetNames(data: ArrayBuffer | Uint8Array): string[] {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  let workbook: XLSX.WorkBook;

  try {
    workbook = XLSX.read(bytes, { type: 'array', bookSheets: true });
  } catch {
    throw new ImportEngineError(
      'PARSE_FAILED',
      'The file could not be read. It may be corrupted or not a real spreadsheet.',
    );
  }

  if (workbook.SheetNames.length === 0) {
    throw new ImportEngineError('EMPTY_FILE', 'The file contains no worksheets.');
  }

  return [...workbook.SheetNames];
}
