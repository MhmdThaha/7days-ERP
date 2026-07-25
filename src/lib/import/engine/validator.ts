/**
 * Stage 4 — Validator.
 *
 * Checks normalized rows against their field definitions:
 *   - required fields present
 *   - values match the declared data type
 *   - values inside allowedValues (when declared)
 *   - custom field-level and row-level validator callbacks
 *
 * Row validation NEVER throws: every problem — including an exception
 * inside a custom validator — becomes a structured ValidationIssue on the
 * row, and each row gets a final status of valid / warning / error.
 */

import {
  ISSUE_CODES,
  type ColumnDefinition,
  type FieldDataType,
  type ImportResult,
  type ImportSummary,
  type NormalizedRow,
  type NormalizedValue,
  type RowStatus,
  type ValidatedRow,
  type ValidationIssue,
  type ValidationOptions,
} from '@/lib/import/engine/types';

/** Validates all rows and computes the run summary. */
export function validateRows(
  rows: readonly NormalizedRow[],
  definitions: readonly ColumnDefinition[],
  options: ValidationOptions = {},
): ImportResult {
  const validatedRows = rows.map((row) => validateRow(row, definitions, options));

  return { rows: validatedRows, summary: summarize(validatedRows) };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function validateRow(
  row: NormalizedRow,
  definitions: readonly ColumnDefinition[],
  options: ValidationOptions,
): ValidatedRow {
  // Normalizer warnings carry over so each row tells its full story.
  const issues: ValidationIssue[] = [...row.warnings];

  for (const definition of definitions) {
    issues.push(...validateField(row.values[definition.field] ?? null, definition));
  }

  issues.push(...runCustomValidators(row, options));

  return {
    rowNumber: row.rowNumber,
    values: row.values,
    issues,
    status: deriveStatus(issues),
  };
}

function validateField(
  value: NormalizedValue,
  definition: ColumnDefinition,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (value === null || value === '') {
    if (definition.required) {
      issues.push({
        severity: 'error',
        code: ISSUE_CODES.REQUIRED_FIELD_MISSING,
        message: `${definition.label} is required.`,
        field: definition.field,
      });
    }

    // Nothing else to check on an empty value.
    return issues;
  }

  if (!matchesDataType(value, definition.dataType)) {
    issues.push({
      severity: 'error',
      code: ISSUE_CODES.INVALID_TYPE,
      message: `${definition.label} must be a ${describeDataType(definition.dataType)}.`,
      field: definition.field,
    });

    return issues;
  }

  if (definition.allowedValues && !isAllowedValue(value, definition.allowedValues)) {
    issues.push({
      severity: 'error',
      code: ISSUE_CODES.VALUE_NOT_ALLOWED,
      message: `${definition.label} must be one of: ${definition.allowedValues.join(', ')}.`,
      field: definition.field,
    });
  }

  return issues;
}

function runCustomValidators(
  row: NormalizedRow,
  options: ValidationOptions,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [field, validator] of Object.entries(options.fieldValidators ?? {})) {
    try {
      issues.push(...validator(row.values[field] ?? null, row));
    } catch (error) {
      issues.push(customValidatorFailure(error, field));
    }
  }

  for (const validator of options.rowValidators ?? []) {
    try {
      issues.push(...validator(row));
    } catch (error) {
      issues.push(customValidatorFailure(error));
    }
  }

  return issues;
}

function customValidatorFailure(error: unknown, field?: string): ValidationIssue {
  const reason = error instanceof Error ? error.message : String(error);

  return {
    severity: 'error',
    code: ISSUE_CODES.CUSTOM_VALIDATOR_FAILED,
    message: `A custom validation rule failed to run: ${reason}`,
    field,
  };
}

function matchesDataType(
  value: Exclude<NormalizedValue, null>,
  dataType: FieldDataType,
): boolean {
  switch (dataType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
    case 'money':
    case 'percent':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'date':
      return value instanceof Date && !Number.isNaN(value.getTime());
  }
}

function describeDataType(dataType: FieldDataType): string {
  switch (dataType) {
    case 'string':
      return 'text value';
    case 'number':
      return 'number';
    case 'money':
      return 'money amount';
    case 'percent':
      return 'percentage';
    case 'boolean':
      return 'yes/no value';
    case 'date':
      return 'date';
  }
}

function isAllowedValue(
  value: Exclude<NormalizedValue, null>,
  allowedValues: readonly string[],
): boolean {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : String(value);

  return allowedValues.some((allowed) => allowed.trim().toLowerCase() === normalized);
}

function deriveStatus(issues: readonly ValidationIssue[]): RowStatus {
  if (issues.some((issue) => issue.severity === 'error')) {
    return 'error';
  }

  if (issues.length > 0) {
    return 'warning';
  }

  return 'valid';
}

function summarize(rows: readonly ValidatedRow[]): ImportSummary {
  let validRows = 0;
  let warningRows = 0;
  let errorRows = 0;

  for (const row of rows) {
    if (row.status === 'valid') validRows += 1;
    else if (row.status === 'warning') warningRows += 1;
    else errorRows += 1;
  }

  return { totalRows: rows.length, validRows, warningRows, errorRows };
}
