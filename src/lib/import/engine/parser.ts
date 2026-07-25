/**
 * Stage 1 — Parser.
 *
 * Reads .xlsx / .xls / .csv bytes into a raw worksheet matrix, then (when
 * asked) materializes a ParsedFile from a chosen header row index.
 *
 * Pure with respect to the outside world: no Firestore, no UI, no entity
 * knowledge. Header *selection* lives in the Header Detection service —
 * this module only reads workbook data and builds rows once a header row
 * is known. Throws ImportEngineError for file-level failures only.
 */

import * as XLSX from 'xlsx';

import {
  ImportEngineError,
  type ParsedFile,
  type RawCellValue,
  type RawImportRow,
} from '@/lib/import/engine/types';

/** Hard ceiling so a bad upload cannot exhaust server memory. */
export const DEFAULT_MAX_DATA_ROWS = 10_000;

const SUPPORTED_EXTENSIONS = ['xlsx', 'xls', 'csv'] as const;

export type ParseOptions = {
  /** Original file name; used to reject unsupported extensions early. */
  fileName?: string;
  /** Worksheet to read; defaults to the first sheet. */
  sheetName?: string;
  /** Maximum number of data rows allowed. Defaults to DEFAULT_MAX_DATA_ROWS. */
  maxRows?: number;
  /**
   * 0-based matrix index to treat as the header row. When omitted,
   * `parseImportFile` falls back to the first non-empty row (legacy
   * behavior). Prefer Header Detection for entity-aware selection.
   */
  headerRowIndex?: number;
};

/** Raw worksheet matrix plus the metadata needed to build a ParsedFile. */
export type ImportWorkbook = {
  sheetName: string;
  /** Row-major cell matrix, including blank rows (aligned to used range). */
  matrix: readonly (readonly RawCellValue[])[];
  /** 0-based spreadsheet row where the sheet's used range begins. */
  usedRangeStartRow: number;
};

/**
 * Reads workbook bytes into a raw matrix. Does not choose a header row.
 *
 * @throws ImportEngineError with code:
 *  - UNSUPPORTED_FILE_TYPE  file extension is not xlsx/xls/csv
 *  - PARSE_FAILED           bytes could not be read as a workbook
 *  - EMPTY_FILE             workbook has no sheets or no cells at all
 *  - SHEET_NOT_FOUND        requested sheet name does not exist
 */
export function readImportWorkbook(
  data: ArrayBuffer | Uint8Array,
  options: Pick<ParseOptions, 'fileName' | 'sheetName'> = {},
): ImportWorkbook {
  const { fileName, sheetName } = options;

  assertSupportedExtension(fileName);

  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  assertMatchingSignature(bytes, fileName);

  const workbook = readWorkbook(bytes);

  if (workbook.SheetNames.length === 0) {
    throw new ImportEngineError('EMPTY_FILE', 'The file contains no worksheets.');
  }

  const resolvedSheetName = resolveSheetName(workbook, sheetName);
  const sheet = workbook.Sheets[resolvedSheetName];

  if (!sheet) {
    throw new ImportEngineError(
      'SHEET_NOT_FOUND',
      `Worksheet "${resolvedSheetName}" could not be read.`,
    );
  }

  const matrix = sheetToMatrix(sheet);
  const usedRangeStartRow = getUsedRangeStartRow(sheet);

  if (matrix.length === 0 || matrix.every(isEmptyRow)) {
    throw new ImportEngineError(
      'EMPTY_FILE',
      'No header row could be detected. The worksheet appears to be empty.',
    );
  }

  return { sheetName: resolvedSheetName, matrix, usedRangeStartRow };
}

/**
 * Builds a ParsedFile from a raw workbook matrix and a chosen header row.
 *
 * @throws ImportEngineError with code:
 *  - NO_HEADER_ROW          headerRowIndex is out of range or that row is empty
 *  - ROW_LIMIT_EXCEEDED     more data rows than maxRows
 */
export function buildParsedFile(
  workbook: ImportWorkbook,
  headerRowIndex: number,
  options: Pick<ParseOptions, 'maxRows'> = {},
): ParsedFile {
  const { maxRows = DEFAULT_MAX_DATA_ROWS } = options;
  const headerRow = workbook.matrix[headerRowIndex];

  if (!headerRow || isEmptyRow(headerRow)) {
    throw new ImportEngineError(
      'NO_HEADER_ROW',
      'No header row could be detected. The worksheet appears to be empty.',
    );
  }

  const headers = buildHeaders(headerRow);
  const { rows, skippedEmptyRowCount } = buildRows(
    workbook.matrix,
    headerRowIndex,
    headers,
    workbook.usedRangeStartRow,
  );

  if (rows.length > maxRows) {
    throw new ImportEngineError(
      'ROW_LIMIT_EXCEEDED',
      `The file has ${rows.length.toLocaleString()} data rows; the limit is ${maxRows.toLocaleString()}.`,
    );
  }

  return {
    sheetName: workbook.sheetName,
    headers,
    rows,
    skippedEmptyRowCount,
  };
}

/**
 * Parses an uploaded spreadsheet into headers + raw rows.
 *
 * When `headerRowIndex` is omitted, uses the first non-empty row (legacy
 * entity-agnostic behavior). Prefer `readImportWorkbook` + Header Detection
 * + `buildParsedFile` for entity-aware imports.
 *
 * @throws ImportEngineError with code:
 *  - UNSUPPORTED_FILE_TYPE  file extension is not xlsx/xls/csv
 *  - PARSE_FAILED           bytes could not be read as a workbook
 *  - EMPTY_FILE             workbook has no sheets or no cells at all
 *  - SHEET_NOT_FOUND        requested sheet name does not exist
 *  - NO_HEADER_ROW          no non-empty row available to use as headers
 *  - ROW_LIMIT_EXCEEDED     more data rows than maxRows
 */
export function parseImportFile(
  data: ArrayBuffer | Uint8Array,
  options: ParseOptions = {},
): ParsedFile {
  const workbook = readImportWorkbook(data, options);

  const headerRowIndex =
    options.headerRowIndex ?? workbook.matrix.findIndex((row) => !isEmptyRow(row));

  if (headerRowIndex < 0) {
    throw new ImportEngineError(
      'NO_HEADER_ROW',
      'No header row could be detected. The worksheet appears to be empty.',
    );
  }

  return buildParsedFile(workbook, headerRowIndex, options);
}

/** True when every cell is null or blank whitespace. */
export function isEmptyRow(row: readonly RawCellValue[]): boolean {
  return row.every(
    (cell) => cell === null || (typeof cell === 'string' && cell.trim() === ''),
  );
}

/** Turns a header row into unique, non-empty column labels. */
export function buildHeaders(headerRow: readonly RawCellValue[]): string[] {
  const seen = new Map<string, number>();

  return headerRow.map((cell, index) => {
    const base =
      cell === null || String(cell).trim() === ''
        ? `Column ${index + 1}`
        : String(cell).trim();

    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);

    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function assertSupportedExtension(fileName: string | undefined): void {
  if (!fileName) {
    return;
  }

  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';

  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new ImportEngineError(
      'UNSUPPORTED_FILE_TYPE',
      `Unsupported file type ".${extension}". Supported types: ${SUPPORTED_EXTENSIONS.map((ext) => `.${ext}`).join(', ')}.`,
    );
  }
}

/** zip local-file header — every real .xlsx starts with this. */
const XLSX_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
/** OLE compound-file header — every real (binary) .xls starts with this. */
const XLS_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/**
 * SheetJS silently falls back to reading unknown bytes as plain text, so a
 * renamed PDF called "products.xlsx" would otherwise parse into garbage
 * rows. When the extension claims xlsx/xls, require the matching file
 * signature. CSV is exempt: plain text has no signature.
 */
function assertMatchingSignature(bytes: Uint8Array, fileName: string | undefined): void {
  const extension = fileName?.split('.').pop()?.toLowerCase();

  const expected =
    extension === 'xlsx' ? XLSX_SIGNATURE : extension === 'xls' ? XLS_SIGNATURE : null;

  if (expected && !expected.every((byte, index) => bytes[index] === byte)) {
    throw new ImportEngineError(
      'PARSE_FAILED',
      'The file could not be read. It may be corrupted or not a real spreadsheet.',
    );
  }
}

function readWorkbook(bytes: Uint8Array): XLSX.WorkBook {
  try {
    // SheetJS auto-detects the container format (zip/xlsx, csv, xls) from
    // the bytes themselves, so one read path covers all supported types.
    //
    // raw: true — do NOT let SheetJS type-infer plain-text (CSV) cells.
    // Its inference turns "5%" into 0.05 and similar, bypassing the
    // normalizer's coercion contract. CSV cells stay strings; the
    // normalizer is the single place values are coerced. Binary formats
    // (xlsx/xls) are unaffected: their cells already carry native types.
    //
    // codepage: 65001 — decode BOM-less CSV text as UTF-8 so symbols like
    // "₹" survive instead of being read as legacy cp1252 mojibake.
    return XLSX.read(bytes, {
      type: 'array',
      cellDates: true,
      dense: false,
      raw: true,
      codepage: 65001,
    });
  } catch {
    throw new ImportEngineError(
      'PARSE_FAILED',
      'The file could not be read. It may be corrupted or not a real spreadsheet.',
    );
  }
}

function resolveSheetName(workbook: XLSX.WorkBook, requested: string | undefined): string {
  const firstSheetName = workbook.SheetNames[0];

  if (requested === undefined) {
    if (firstSheetName === undefined) {
      throw new ImportEngineError('EMPTY_FILE', 'The file contains no worksheets.');
    }

    return firstSheetName;
  }

  if (!workbook.SheetNames.includes(requested)) {
    throw new ImportEngineError(
      'SHEET_NOT_FOUND',
      `Worksheet "${requested}" was not found. Available sheets: ${workbook.SheetNames.join(', ')}.`,
    );
  }

  return requested;
}

/** 0-based spreadsheet row where the sheet's used range begins. */
function getUsedRangeStartRow(sheet: XLSX.WorkSheet): number {
  const ref = sheet['!ref'];

  if (!ref) {
    return 0;
  }

  return XLSX.utils.decode_range(ref).s.r;
}

/** Converts the worksheet into a row-major matrix, keeping blank rows so
 *  original spreadsheet row numbers stay aligned. */
function sheetToMatrix(sheet: XLSX.WorkSheet): RawCellValue[][] {
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: true,
    raw: true,
  });

  return raw.map((row) => row.map(sanitizeCell));
}

function sanitizeCell(value: unknown): RawCellValue {
  if (value === null || value === undefined) {
    return null;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date
  ) {
    return value;
  }

  // Formula errors and other exotic cell types degrade to their string form.
  return String(value);
}

function buildRows(
  matrix: readonly (readonly RawCellValue[])[],
  headerRowIndex: number,
  headers: readonly string[],
  usedRangeStartRow: number,
): { rows: RawImportRow[]; skippedEmptyRowCount: number } {
  const rows: RawImportRow[] = [];
  let skippedEmptyRowCount = 0;

  for (let index = headerRowIndex + 1; index < matrix.length; index += 1) {
    const matrixRow = matrix[index] ?? [];

    if (isEmptyRow(matrixRow)) {
      skippedEmptyRowCount += 1;
      continue;
    }

    const cells: Record<string, RawCellValue> = {};

    headers.forEach((header, columnIndex) => {
      cells[header] = matrixRow[columnIndex] ?? null;
    });

    rows.push({
      // Matrix index is relative to the used range; adding the range offset
      // plus 1 yields the 1-based row number the user sees in Excel.
      rowNumber: usedRangeStartRow + index + 1,
      cells,
    });
  }

  return { rows, skippedEmptyRowCount };
}
