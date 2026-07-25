/**
 * Sale Import Grouping.
 *
 * Pure transformation: flat validated spreadsheet rows (one row = one line
 * item) → SaleImportGroup[] (one group = one sale document candidate).
 *
 * Runs AFTER the generic engine validates rows and BEFORE conflict
 * detection / commit. No Firestore, product lookup, or inventory logic.
 */

import type { NormalizedValue, ValidatedRow, ValidationIssue } from '@/lib/import/engine/types';

export const SALE_GROUP_ISSUE_CODES = {
  CONFLICTING_SALE_DATE: 'CONFLICTING_SALE_DATE',
  CONFLICTING_CUSTOMER_NAME: 'CONFLICTING_CUSTOMER_NAME',
  CONFLICTING_SALE_NUMBER: 'CONFLICTING_SALE_NUMBER',
} as const;

/** One imported line item with its original row context preserved. */
export type SaleImportLineItem = {
  rowNumber: number;
  values: Readonly<Record<string, NormalizedValue>>;
  issues: readonly ValidationIssue[];
  status: ValidatedRow['status'];
};

export type SaleImportGroupHeader = {
  /** Display sale number from the first row, or null when absent. */
  saleNumber: string | null;
  /** Trimmed, uppercased key fragment when a sale number is present. */
  normalizedSaleNumber: string | null;
  saleDate: NormalizedValue;
  customerName: NormalizedValue;
  notes: NormalizedValue;
};

/** One sale document candidate assembled from one or more spreadsheet rows. */
export type SaleImportGroup = {
  /** Stable bucket key (`number:…` or `fallback:…`). */
  groupKey: string;
  /** All source spreadsheet row numbers, ascending. */
  rowNumbers: readonly number[];
  /** Header fields taken from the earliest row in the group. */
  header: SaleImportGroupHeader;
  /** Line items in spreadsheet row order. */
  lines: readonly SaleImportLineItem[];
  /** Cross-row header mismatches within the same group. */
  groupIssues: readonly ValidationIssue[];
};

function readTrimmedString(value: NormalizedValue | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

/** Matches saleRepository sale-number normalization. */
export function normalizeSaleNumberValue(value: NormalizedValue | undefined): string | null {
  const trimmed = readTrimmedString(value);

  return trimmed ? trimmed.toUpperCase() : null;
}

export function normalizeSaleDateValue(value: NormalizedValue | undefined): string | null {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return readTrimmedString(value);
}

function normalizeCustomerNameValue(value: NormalizedValue | undefined): string | null {
  const trimmed = readTrimmedString(value);

  return trimmed ? trimmed.toLowerCase() : null;
}

function groupIssue(
  code: string,
  message: string,
  field: string,
  rowNumber: number,
): ValidationIssue {
  return {
    severity: 'error',
    code,
    message: `${message} (row ${rowNumber}).`,
    field,
  };
}

/**
 * Builds the deterministic group key for one validated row.
 *
 *   1. Sale Number present → `number:{NORMALIZED_SALE_NUMBER}`
 *   2. Otherwise            → `fallback:{YYYY-MM-DD}|{customer}` (empty
 *                              segments allowed)
 */
export function buildSaleImportGroupKey(row: ValidatedRow): string {
  const normalizedSaleNumber = normalizeSaleNumberValue(row.values['saleNumber']);

  if (normalizedSaleNumber) {
    return `number:${normalizedSaleNumber}`;
  }

  const datePart = normalizeSaleDateValue(row.values['saleDate']) ?? '';
  const customerPart = normalizeCustomerNameValue(row.values['customerName']) ?? '';

  return `fallback:${datePart}|${customerPart}`;
}

function toLineItem(row: ValidatedRow): SaleImportLineItem {
  return {
    rowNumber: row.rowNumber,
    values: row.values,
    issues: row.issues,
    status: row.status,
  };
}

function valuesEqual(a: NormalizedValue | undefined, b: NormalizedValue | undefined): boolean {
  if (a === b) {
    return true;
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (typeof a === 'string' && typeof b === 'string') {
    return a.trim() === b.trim();
  }

  return false;
}

function detectHeaderConflicts(
  headerRow: ValidatedRow,
  row: ValidatedRow,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const headerDate = normalizeSaleDateValue(headerRow.values['saleDate']);
  const rowDate = normalizeSaleDateValue(row.values['saleDate']);

  if (headerDate && rowDate && headerDate !== rowDate) {
    issues.push(
      groupIssue(
        SALE_GROUP_ISSUE_CODES.CONFLICTING_SALE_DATE,
        'Sale Date differs from the first row of this sale',
        'saleDate',
        row.rowNumber,
      ),
    );
  }

  const headerCustomer = normalizeCustomerNameValue(headerRow.values['customerName']);
  const rowCustomer = normalizeCustomerNameValue(row.values['customerName']);

  if (headerCustomer && rowCustomer && headerCustomer !== rowCustomer) {
    issues.push(
      groupIssue(
        SALE_GROUP_ISSUE_CODES.CONFLICTING_CUSTOMER_NAME,
        'Customer Name differs from the first row of this sale',
        'customerName',
        row.rowNumber,
      ),
    );
  }

  const headerNumber = normalizeSaleNumberValue(headerRow.values['saleNumber']);
  const rowNumber = normalizeSaleNumberValue(row.values['saleNumber']);

  if (headerNumber && rowNumber && headerNumber !== rowNumber) {
    issues.push(
      groupIssue(
        SALE_GROUP_ISSUE_CODES.CONFLICTING_SALE_NUMBER,
        'Sale Number differs from the first row of this sale',
        'saleNumber',
        row.rowNumber,
      ),
    );
  }

  return issues;
}

function buildGroupHeader(headerRow: ValidatedRow): SaleImportGroupHeader {
  const normalizedSaleNumber = normalizeSaleNumberValue(headerRow.values['saleNumber']);

  return {
    saleNumber: readTrimmedString(headerRow.values['saleNumber']),
    normalizedSaleNumber,
    saleDate: headerRow.values['saleDate'] ?? null,
    customerName: headerRow.values['customerName'] ?? null,
    notes: headerRow.values['notes'] ?? null,
  };
}

function buildGroup(groupKey: string, rows: readonly ValidatedRow[]): SaleImportGroup {
  const headerRow = rows[0]!;
  const groupIssues: ValidationIssue[] = [];

  for (const row of rows.slice(1)) {
    groupIssues.push(...detectHeaderConflicts(headerRow, row));
  }

  return {
    groupKey,
    rowNumbers: rows.map((row) => row.rowNumber),
    header: buildGroupHeader(headerRow),
    lines: rows.map(toLineItem),
    groupIssues,
  };
}

/**
 * Groups validated flat rows into sale document candidates.
 *
 * Rows are bucketed by {@link buildSaleImportGroupKey}, preserving spreadsheet
 * order within and across groups. Each line retains its normalized values,
 * validation issues, and status unchanged.
 */
export function groupSaleImportRows(rows: readonly ValidatedRow[]): SaleImportGroup[] {
  if (rows.length === 0) {
    return [];
  }

  const sortedRows = [...rows].sort((a, b) => a.rowNumber - b.rowNumber);
  const buckets = new Map<string, ValidatedRow[]>();

  for (const row of sortedRows) {
    const key = buildSaleImportGroupKey(row);
    const bucket = buckets.get(key);

    if (bucket) {
      bucket.push(row);
    } else {
      buckets.set(key, [row]);
    }
  }

  return [...buckets.entries()].map(([groupKey, bucketRows]) => buildGroup(groupKey, bucketRows));
}

/** Returns true when two normalized values differ for grouping header fields. */
export function saleImportHeaderValuesConflict(
  field: 'saleDate' | 'customerName' | 'saleNumber',
  a: NormalizedValue | undefined,
  b: NormalizedValue | undefined,
): boolean {
  if (valuesEqual(a, b)) {
    return false;
  }

  switch (field) {
    case 'saleDate':
      return (
        normalizeSaleDateValue(a) !== null &&
        normalizeSaleDateValue(b) !== null &&
        normalizeSaleDateValue(a) !== normalizeSaleDateValue(b)
      );
    case 'customerName':
      return (
        normalizeCustomerNameValue(a) !== null &&
        normalizeCustomerNameValue(b) !== null &&
        normalizeCustomerNameValue(a) !== normalizeCustomerNameValue(b)
      );
    case 'saleNumber':
      return (
        normalizeSaleNumberValue(a) !== null &&
        normalizeSaleNumberValue(b) !== null &&
        normalizeSaleNumberValue(a) !== normalizeSaleNumberValue(b)
      );
  }
}
