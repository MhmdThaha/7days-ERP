/**
 * Import Orchestration Service.
 *
 * Coordinates the pipeline into one run:
 *
 *   readImportWorkbook → detectHeaderRow → detectReport → buildParsedFile
 *     → applyMapping → normalizeRows → validateRows
 *
 * Contains NO business logic and NO entity knowledge of its own: entity
 * behavior comes entirely from the EntityImportDefinition registry
 * (columns + validation rules as data). No Firestore, no React, no UI,
 * no writes — committing validated rows is a later phase.
 *
 * Throws only what the engine throws (ImportEngineError for file/config
 * level failures). Row-level problems never throw; they arrive as issues
 * on the returned rows.
 */

import {
  IMPORT_DEFINITIONS,
  type ImportEntityType,
} from '@/lib/import/definitions';
import { applyMapping } from '@/lib/import/engine/mapper';
import { normalizeRows } from '@/lib/import/engine/normalizer';
import {
  buildParsedFile,
  parseImportFile,
  readImportWorkbook,
} from '@/lib/import/engine/parser';
import type {
  ColumnDefinition,
  ImportResult,
  MappingConfig,
  ParsedFile,
} from '@/lib/import/engine/types';
import { ImportEngineError } from '@/lib/import/engine/types';
import { validateRows } from '@/lib/import/engine/validator';
import {
  detectReport,
  type ReportDetectionResult,
} from '@/lib/import/reports';
import {
  detectHeaderRow,
  type HeaderDetectionResult,
} from '@/lib/import/services/header-detection.service';

export type RunImportInput = {
  /** Raw bytes of the uploaded file. Ignored when `parsed` is provided. */
  data?: ArrayBuffer | Uint8Array;
  /** Original file name; used to reject unsupported extensions early. */
  fileName?: string;
  /** Worksheet to read; defaults to the first sheet. */
  sheetName?: string;
  /** Which entity this import targets, e.g. "product". */
  entityType: ImportEntityType;
  /** Column mappings chosen by the user or a saved profile. */
  mapping: MappingConfig;
  /**
   * Pre-built ParsedFile from a single read + header detection pass.
   * When set, skips re-reading the workbook (eliminates double-parse).
   */
  parsed?: ParsedFile;
  /**
   * When true (default), detect the header row via entity aliases before
   * building ParsedFile. Ignored when `parsed` is provided.
   * Set false to use the legacy first-non-empty-row parser behavior.
   */
  detectHeaders?: boolean;
};

/** Everything one pipeline run produces: validated rows plus the
 *  file- and mapping-level facts the preview UI needs to explain itself. */
export type ImportRunReport = {
  entityType: ImportEntityType;
  /** Worksheet that was actually read. */
  sheetName: string;
  /** Detected source headers, in original column order. */
  headers: readonly string[];
  /** Fully empty rows skipped by the parser. */
  skippedEmptyRowCount: number;
  /** File headers that were not mapped and were therefore ignored. */
  ignoredHeaders: readonly string[];
  /** Mapped source headers that do not exist in the file. */
  missingSourceHeaders: readonly string[];
  /** Required target fields with no usable source column. The caller
   *  should block the commit step while this is non-empty. */
  missingRequiredFields: readonly string[];
  /** Validated rows + summary from the engine's final stage. */
  result: ImportResult;
};

/** Result of preparing a file once: read + header + report + ParsedFile. */
export type PreparedImportFile = {
  parsed: ParsedFile;
  headerDetection: HeaderDetectionResult;
  reportDetection: ReportDetectionResult;
};

/**
 * Placeholder report when no column mappings exist yet (Universal Import U1).
 * Populates missingRequiredFields from entity columns so guidance can steer
 * manual mapping without calling applyMapping on an empty config.
 */
export function emptyImportRunReport(
  entityType: ImportEntityType,
  parsed: Pick<ParsedFile, 'sheetName' | 'headers' | 'skippedEmptyRowCount'>,
  columns: readonly ColumnDefinition[],
): ImportRunReport {
  return {
    entityType,
    sheetName: parsed.sheetName,
    headers: parsed.headers,
    skippedEmptyRowCount: parsed.skippedEmptyRowCount,
    ignoredHeaders: [...parsed.headers],
    missingSourceHeaders: [],
    missingRequiredFields: columns
      .filter((column) => column.required)
      .map((column) => column.field),
    result: {
      rows: [],
      summary: { totalRows: 0, validRows: 0, warningRows: 0, errorRows: 0 },
    },
  };
}

/**
 * Single-parse prepare step:
 *   read workbook → detect header → detect report → materialize ParsedFile.
 * Downstream stages (auto-map, runImport) reuse `parsed`.
 * Report classification is available for later gating / profiles — this
 * phase does not change auto-mapping behavior.
 */
export function prepareImportFile(
  data: ArrayBuffer | Uint8Array,
  entityType: ImportEntityType,
  options: { fileName?: string; sheetName?: string; maxRows?: number } = {},
): PreparedImportFile {
  const definition = IMPORT_DEFINITIONS[entityType];
  const workbook = readImportWorkbook(data, {
    fileName: options.fileName,
    sheetName: options.sheetName,
  });

  const headerDetection = detectHeaderRow(workbook.matrix, definition.columns);

  if (headerDetection.headerRowIndex < 0) {
    throw new ImportEngineError(
      'NO_HEADER_ROW',
      'No header row could be detected. The worksheet appears to be empty.',
    );
  }

  const reportDetection = detectReport(headerDetection.detectedHeaders, {
    entityType,
  });

  const parsed = buildParsedFile(workbook, headerDetection.headerRowIndex, {
    maxRows: options.maxRows,
  });

  return { parsed, headerDetection, reportDetection };
}

/**
 * Runs the map → normalize → validate stages against an already-parsed file.
 */
export function runImportFromParsed(
  parsed: ParsedFile,
  entityType: ImportEntityType,
  mapping: MappingConfig,
): ImportRunReport {
  const definition = IMPORT_DEFINITIONS[entityType];

  const mapped = applyMapping(parsed, mapping, definition.columns);
  const normalized = normalizeRows(mapped.rows, definition.columns);
  const result = validateRows(normalized, definition.columns, definition.validation);

  return {
    entityType,
    sheetName: parsed.sheetName,
    headers: parsed.headers,
    skippedEmptyRowCount: parsed.skippedEmptyRowCount,
    ignoredHeaders: mapped.ignoredHeaders,
    missingSourceHeaders: mapped.missingSourceHeaders,
    missingRequiredFields: mapped.missingRequiredFields,
    result,
  };
}

/**
 * Runs the full import pipeline for one uploaded file.
 *
 * @throws ImportEngineError for file-level failures (unsupported type,
 *         unreadable bytes, no header row, row limit) or a structurally
 *         invalid mapping config. Never throws for row-level data issues.
 */
export function runImport(input: RunImportInput): ImportRunReport {
  if (input.parsed) {
    return runImportFromParsed(input.parsed, input.entityType, input.mapping);
  }

  if (!input.data) {
    throw new ImportEngineError(
      'PARSE_FAILED',
      'No file data was provided to the import pipeline.',
    );
  }

  const detectHeaders = input.detectHeaders !== false;

  if (detectHeaders) {
    const { parsed } = prepareImportFile(input.data, input.entityType, {
      fileName: input.fileName,
      sheetName: input.sheetName,
    });

    return runImportFromParsed(parsed, input.entityType, input.mapping);
  }

  // Legacy path: first non-empty row as header (entity-agnostic).
  const parsed = parseImportFile(input.data, {
    fileName: input.fileName,
    sheetName: input.sheetName,
  });

  return runImportFromParsed(parsed, input.entityType, input.mapping);
}
