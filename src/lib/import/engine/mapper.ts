/**
 * Stage 2 — Mapper.
 *
 * Applies a MappingConfig (source header → target field) to parsed rows.
 * Renames mapped columns, ignores unmapped ones, and reports missing
 * required columns as data rather than exceptions.
 *
 * Pure: no I/O, no entity knowledge. Throws ImportEngineError only for a
 * structurally invalid MappingConfig (a programming/configuration error,
 * not a data problem).
 */

import {
  ImportEngineError,
  type ColumnDefinition,
  type ColumnMapping,
  type MappedRow,
  type MappingConfig,
  type MappingResult,
  type ParsedFile,
  type RawCellValue,
} from '@/lib/import/engine/types';

/**
 * Maps raw parsed rows onto target fields.
 *
 * @param parsed       Output of the parser stage (headers + raw rows).
 * @param config       Column mappings chosen by the user or a saved profile.
 * @param definitions  Optional target-field definitions; when provided,
 *                     required fields without a usable source column are
 *                     reported in `missingRequiredFields`.
 *
 * @throws ImportEngineError INVALID_MAPPING when the config itself is
 *         malformed (no mappings, or two mappings targeting the same field).
 */
export function applyMapping(
  parsed: Pick<ParsedFile, 'headers' | 'rows'>,
  config: MappingConfig,
  definitions: readonly ColumnDefinition[] = [],
): MappingResult {
  assertValidConfig(config);

  const headerSet = new Set(parsed.headers);

  const missingSourceHeaders = config.columnMappings
    .filter((mapping) => !headerSet.has(mapping.sourceHeader))
    .map((mapping) => mapping.sourceHeader);

  const effectiveMappings = config.columnMappings.filter((mapping) =>
    headerSet.has(mapping.sourceHeader),
  );

  const mappedFields = new Set(effectiveMappings.map((mapping) => mapping.targetField));

  const missingRequiredFields = definitions
    .filter((definition) => definition.required && !mappedFields.has(definition.field))
    .map((definition) => definition.field);

  const usedHeaders = new Set(effectiveMappings.map((mapping) => mapping.sourceHeader));

  const ignoredHeaders = parsed.headers.filter((header) => !usedHeaders.has(header));

  const rows = parsed.rows.map((row) => mapRow(row.rowNumber, row.cells, effectiveMappings));

  return { rows, missingRequiredFields, missingSourceHeaders, ignoredHeaders };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function assertValidConfig(config: MappingConfig): void {
  if (config.columnMappings.length === 0) {
    throw new ImportEngineError(
      'INVALID_MAPPING',
      'The mapping configuration contains no column mappings.',
    );
  }

  const seenTargets = new Set<string>();

  for (const mapping of config.columnMappings) {
    if (mapping.targetField.trim() === '' || mapping.sourceHeader.trim() === '') {
      throw new ImportEngineError(
        'INVALID_MAPPING',
        'Every column mapping needs both a source header and a target field.',
      );
    }

    if (seenTargets.has(mapping.targetField)) {
      throw new ImportEngineError(
        'INVALID_MAPPING',
        `Target field "${mapping.targetField}" is mapped more than once.`,
      );
    }

    seenTargets.add(mapping.targetField);
  }
}

function mapRow(
  rowNumber: number,
  cells: Readonly<Record<string, RawCellValue>>,
  mappings: readonly ColumnMapping[],
): MappedRow {
  const values: Record<string, RawCellValue> = {};

  for (const mapping of mappings) {
    values[mapping.targetField] = cells[mapping.sourceHeader] ?? null;
  }

  return { rowNumber, values };
}
