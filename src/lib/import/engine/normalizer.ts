/**
 * Stage 3 — Normalizer.
 *
 * Coerces mapped raw values into their declared data types:
 *
 *   "  1,250 " → 1250        (number / money)
 *   "5%"       → 5           (percent / number)
 *   "YES"      → true        (boolean)
 *   "15/03/2026", Excel serials, ISO strings → Date
 *
 * Unparseable values become null plus a warning on the row — the
 * normalizer never throws for data problems. Whether a null is acceptable
 * is decided later by the validator (required fields).
 *
 * Note: money values are returned as plain numbers in major units.
 * Scaling to integer minor units (paise) is an entity-definition concern
 * in a later phase, not an engine concern.
 */

import {
  ISSUE_CODES,
  type ColumnDefinition,
  type MappedRow,
  type NormalizedRow,
  type NormalizedValue,
  type RawCellValue,
  type ValidationIssue,
} from '@/lib/import/engine/types';

/** Normalizes every mapped row against the provided field definitions.
 *  Fields without a definition are treated as plain strings. */
export function normalizeRows(
  rows: readonly MappedRow[],
  definitions: readonly ColumnDefinition[],
): NormalizedRow[] {
  const definitionsByField = new Map(
    definitions.map((definition) => [definition.field, definition]),
  );

  return rows.map((row) => normalizeRow(row, definitionsByField));
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type NormalizeOutcome = {
  value: NormalizedValue;
  warning?: Omit<ValidationIssue, 'field'>;
};

function normalizeRow(
  row: MappedRow,
  definitionsByField: ReadonlyMap<string, ColumnDefinition>,
): NormalizedRow {
  const values: Record<string, NormalizedValue> = {};
  const warnings: ValidationIssue[] = [];

  for (const [field, rawValue] of Object.entries(row.values)) {
    const definition = definitionsByField.get(field);
    const outcome = normalizeValue(rawValue, definition);

    values[field] = outcome.value;

    if (outcome.warning) {
      warnings.push({ ...outcome.warning, field });
    }
  }

  return { rowNumber: row.rowNumber, values, warnings };
}

function normalizeValue(
  raw: RawCellValue,
  definition: ColumnDefinition | undefined,
): NormalizeOutcome {
  if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return { value: null };
  }

  switch (definition?.dataType) {
    case 'number':
    case 'money':
    case 'percent':
      return normalizeNumberLike(raw, definition.dataType);
    case 'boolean':
      return normalizeBoolean(raw);
    case 'date':
      return normalizeDate(raw);
    case 'string':
    case undefined:
    default:
      return normalizeString(raw);
  }
}

// ---- string ----------------------------------------------------------------

function normalizeString(raw: Exclude<RawCellValue, null>): NormalizeOutcome {
  if (raw instanceof Date) {
    // A date-typed cell mapped onto a string field keeps a stable ISO form.
    return { value: raw.toISOString().slice(0, 10) };
  }

  return { value: String(raw).trim() };
}

// ---- number / money / percent ----------------------------------------------

const CURRENCY_AND_GROUPING = /[₹$€£,\s]/g;
const CURRENCY_SYMBOLS = /[₹$€£]/g;

/** Leading numeric token with a separate alphabetic unit suffix, e.g. "58.0 PAC". */
const NUMBER_WITH_UNIT_SUFFIX =
  /^(-?\(?[\d,]+(?:\.\d+)?\)?)\s+([A-Za-z][A-Za-z0-9/-]*)\s*$/;

function normalizeNumberLike(
  raw: Exclude<RawCellValue, null>,
  dataType: 'number' | 'money' | 'percent',
): NormalizeOutcome {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { value: raw } : invalidNumber(raw, dataType);
  }

  if (typeof raw === 'boolean' || raw instanceof Date) {
    return invalidNumber(raw, dataType);
  }

  if (dataType === 'number') {
    return normalizeQuantityNumber(raw, dataType);
  }

  let text = raw.trim().replace(CURRENCY_AND_GROUPING, '');

  // "5%" → "5" for percent and plain number fields alike.
  if (text.endsWith('%')) {
    text = text.slice(0, -1);
  }

  // Accounting negatives: "(250)" → "-250".
  if (text.startsWith('(') && text.endsWith(')')) {
    text = `-${text.slice(1, -1)}`;
  }

  if (text === '' || text === '-') {
    return invalidNumber(raw, dataType);
  }

  const parsed = Number(text);

  if (!Number.isFinite(parsed)) {
    return invalidNumber(raw, dataType);
  }

  return { value: parsed };
}

function normalizeQuantityNumber(
  raw: string,
  dataType: 'number' | 'money' | 'percent',
): NormalizeOutcome {
  const trimmed = raw.trim();
  const withoutCurrency = trimmed.replace(CURRENCY_SYMBOLS, '');
  const unitMatch = NUMBER_WITH_UNIT_SUFFIX.exec(withoutCurrency);

  if (unitMatch) {
    const parsed = parseNumericToken(unitMatch[1] ?? '');

    if (parsed !== null) {
      return { value: parsed };
    }
  }

  let text = trimmed.replace(CURRENCY_AND_GROUPING, '');

  if (text.endsWith('%')) {
    text = text.slice(0, -1);
  }

  if (text.startsWith('(') && text.endsWith(')')) {
    text = `-${text.slice(1, -1)}`;
  }

  if (text === '' || text === '-') {
    return invalidNumber(raw, dataType);
  }

  const parsed = Number(text);

  if (!Number.isFinite(parsed)) {
    return invalidNumber(raw, dataType);
  }

  return { value: parsed };
}

function parseNumericToken(token: string): number | null {
  let text = token.replace(/,/g, '').replace(/\s/g, '');

  if (text.startsWith('(') && text.endsWith(')')) {
    text = `-${text.slice(1, -1)}`;
  }

  if (text === '' || text === '-') {
    return null;
  }

  const parsed = Number(text);

  return Number.isFinite(parsed) ? parsed : null;
}

function invalidNumber(
  value: RawCellValue,
  dataType: 'number' | 'money' | 'percent',
): NormalizeOutcome {
  return {
    value: null,
    warning: {
      severity: 'warning',
      code: ISSUE_CODES.INVALID_NUMBER,
      message: `"${String(value)}" is not a valid ${dataType === 'number' ? 'number' : dataType} and was left empty.`,
    },
  };
}

// ---- boolean ----------------------------------------------------------------

const TRUE_TOKENS = new Set(['true', 'yes', 'y', '1']);
const FALSE_TOKENS = new Set(['false', 'no', 'n', '0']);

function normalizeBoolean(raw: Exclude<RawCellValue, null>): NormalizeOutcome {
  if (typeof raw === 'boolean') {
    return { value: raw };
  }

  if (typeof raw === 'number') {
    if (raw === 1) return { value: true };
    if (raw === 0) return { value: false };
  }

  if (typeof raw === 'string') {
    const token = raw.trim().toLowerCase();

    if (TRUE_TOKENS.has(token)) return { value: true };
    if (FALSE_TOKENS.has(token)) return { value: false };
  }

  return {
    value: null,
    warning: {
      severity: 'warning',
      code: ISSUE_CODES.INVALID_BOOLEAN,
      message: `"${String(raw)}" is not a recognized yes/no value and was left empty.`,
    },
  };
}

// ---- date --------------------------------------------------------------------

/** Days between 1899-12-30 (Excel epoch) and 1970-01-01 (Unix epoch). */
const EXCEL_EPOCH_OFFSET_DAYS = 25_569;
const MS_PER_DAY = 86_400_000;
/** Excel serial for 1900-01-01. */
const MIN_EXCEL_DATE_SERIAL = 1;
/** Excel serial for 9999-12-31 (Excel's own maximum date). */
const MAX_EXCEL_DATE_SERIAL = 2_958_465;

/** dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy (day-first, as used across India). */
const DAY_FIRST_PATTERN = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
/** yyyy-mm-dd / yyyy/mm/dd (ISO-like). */
const ISO_PATTERN = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/;

function normalizeDate(raw: Exclude<RawCellValue, null>): NormalizeOutcome {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? invalidDate(raw) : { value: raw };
  }

  if (typeof raw === 'number') {
    // Excel date serial (days since 1899-12-30). This branch only runs for
    // fields declared as dates, so small quantities (e.g. 12) cannot leak in
    // from quantity columns. Serials outside Excel's own calendar range
    // (1900-01-01 .. 9999-12-31) are rejected as implausible.
    if (raw < MIN_EXCEL_DATE_SERIAL || raw > MAX_EXCEL_DATE_SERIAL) {
      return invalidDate(raw);
    }

    const date = new Date((raw - EXCEL_EPOCH_OFFSET_DAYS) * MS_PER_DAY);

    return Number.isNaN(date.getTime()) ? invalidDate(raw) : { value: date };
  }

  if (typeof raw === 'boolean') {
    return invalidDate(raw);
  }

  const text = raw.trim();

  const dayFirst = DAY_FIRST_PATTERN.exec(text);

  if (dayFirst) {
    return buildDate(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]), raw);
  }

  const iso = ISO_PATTERN.exec(text);

  if (iso) {
    return buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]), raw);
  }

  return invalidDate(raw);
}

function buildDate(
  year: number,
  month: number,
  day: number,
  raw: RawCellValue,
): NormalizeOutcome {
  const date = new Date(Date.UTC(year, month - 1, day));

  const isValid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  return isValid ? { value: date } : invalidDate(raw);
}

function invalidDate(raw: RawCellValue): NormalizeOutcome {
  return {
    value: null,
    warning: {
      severity: 'warning',
      code: ISSUE_CODES.INVALID_DATE,
      message: `"${String(raw)}" is not a recognized date and was left empty.`,
    },
  };
}
