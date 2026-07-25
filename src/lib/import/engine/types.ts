/**
 * Core types for the generic import engine.
 *
 * The engine is entity-agnostic: nothing in this module (or any engine
 * module) knows about products, customers, suppliers, sales, purchases,
 * or Firestore. Entity-specific behavior arrives later as data
 * (ColumnDefinition[], MappingConfig, validator callbacks).
 */

// ---------------------------------------------------------------------------
// Cell & row primitives
// ---------------------------------------------------------------------------

/** A cell value as read from the spreadsheet, before normalization. */
export type RawCellValue = string | number | boolean | Date | null;

/** A cell value after normalization. */
export type NormalizedValue = string | number | boolean | Date | null;

/** One data row exactly as parsed from the file. */
export type RawImportRow = {
  /** 1-based row number in the original spreadsheet (as the user sees it). */
  rowNumber: number;
  /** Cell values keyed by the detected header label. */
  cells: Readonly<Record<string, RawCellValue>>;
};

/** Result of parsing an uploaded file. */
export type ParsedFile = {
  sheetName: string;
  /** Header labels in original column order, de-duplicated. */
  headers: readonly string[];
  rows: readonly RawImportRow[];
  /** Count of fully empty rows that were skipped. */
  skippedEmptyRowCount: number;
};

// ---------------------------------------------------------------------------
// Field definitions (provided by entity definitions in later phases)
// ---------------------------------------------------------------------------

export type FieldDataType =
  | 'string'
  | 'number'
  | 'money'
  | 'percent'
  | 'boolean'
  | 'date';

/**
 * Declares one target field an import can populate.
 * Entity definitions supply these; the engine only interprets them.
 */
export type ColumnDefinition = {
  /** Target field key, e.g. "name". */
  field: string;
  /** Human-readable label for UI and error messages. */
  label: string;
  dataType: FieldDataType;
  required: boolean;
  /**
   * When set, the normalized value must match one of these values
   * (case-insensitive for strings).
   */
  allowedValues?: readonly string[];
  /** Alternate header spellings, used by auto-detection in later phases. */
  synonyms?: readonly string[];
};

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/** Maps one source spreadsheet column to one target field. */
export type ColumnMapping = {
  targetField: string;
  sourceHeader: string;
};

export type MappingConfig = {
  columnMappings: readonly ColumnMapping[];
};

/** A row after column mapping: values keyed by target field. */
export type MappedRow = {
  rowNumber: number;
  values: Readonly<Record<string, RawCellValue>>;
};

export type MappingResult = {
  rows: readonly MappedRow[];
  /** Required target fields that ended up with no usable source column. */
  missingRequiredFields: readonly string[];
  /** Mapped source headers that do not exist in the parsed file. */
  missingSourceHeaders: readonly string[];
  /** File headers that were not mapped and were therefore ignored. */
  ignoredHeaders: readonly string[];
};

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/** A row after value normalization, with any coercion warnings attached. */
export type NormalizedRow = {
  rowNumber: number;
  values: Readonly<Record<string, NormalizedValue>>;
  warnings: readonly ValidationIssue[];
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type IssueSeverity = 'error' | 'warning';

/** A structured problem attached to a row (optionally to one field). */
export type ValidationIssue = {
  severity: IssueSeverity;
  /** Stable machine-readable code, e.g. "REQUIRED_FIELD_MISSING". */
  code: string;
  /** Human-readable explanation. */
  message: string;
  /** Target field key, when the issue concerns a single field. */
  field?: string;
};

export type RowStatus = 'valid' | 'warning' | 'error';

export type ValidatedRow = {
  rowNumber: number;
  values: Readonly<Record<string, NormalizedValue>>;
  issues: readonly ValidationIssue[];
  status: RowStatus;
};

/**
 * Custom per-field validator. Receives the normalized value and the full row
 * for cross-field checks. Returns zero or more issues; must not mutate.
 */
export type FieldValidator = (
  value: NormalizedValue,
  row: NormalizedRow,
) => readonly ValidationIssue[];

/** Custom whole-row validator for rules spanning multiple fields. */
export type RowValidator = (row: NormalizedRow) => readonly ValidationIssue[];

export type ValidationOptions = {
  /** Keyed by target field. */
  fieldValidators?: Readonly<Record<string, FieldValidator>>;
  rowValidators?: readonly RowValidator[];
};

export type ImportSummary = {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
};

/** Final output of the engine's validate stage. */
export type ImportResult = {
  rows: readonly ValidatedRow[];
  summary: ImportSummary;
};

// ---------------------------------------------------------------------------
// Issue codes (stable identifiers shared across stages)
// ---------------------------------------------------------------------------

export const ISSUE_CODES = {
  REQUIRED_FIELD_MISSING: 'REQUIRED_FIELD_MISSING',
  INVALID_NUMBER: 'INVALID_NUMBER',
  INVALID_BOOLEAN: 'INVALID_BOOLEAN',
  INVALID_DATE: 'INVALID_DATE',
  INVALID_TYPE: 'INVALID_TYPE',
  VALUE_NOT_ALLOWED: 'VALUE_NOT_ALLOWED',
  CUSTOM_VALIDATOR_FAILED: 'CUSTOM_VALIDATOR_FAILED',
} as const;

export type IssueCode = (typeof ISSUE_CODES)[keyof typeof ISSUE_CODES];

// ---------------------------------------------------------------------------
// Typed errors (thrown only for file/config-level failures, never per row)
// ---------------------------------------------------------------------------

export type ImportErrorCode =
  | 'UNSUPPORTED_FILE_TYPE'
  | 'EMPTY_FILE'
  | 'NO_HEADER_ROW'
  | 'SHEET_NOT_FOUND'
  | 'ROW_LIMIT_EXCEEDED'
  | 'PARSE_FAILED'
  | 'INVALID_MAPPING';

export class ImportEngineError extends Error {
  readonly code: ImportErrorCode;

  constructor(code: ImportErrorCode, message: string) {
    super(message);
    this.name = 'ImportEngineError';
    this.code = code;
  }
}
