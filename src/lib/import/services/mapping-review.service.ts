/**
 * Mapping Review service — builds view models and applies user edits.
 *
 * Pure: no React, no Firestore. Consumes pipeline outputs (Header Detection,
 * Report Detection, Auto Mapping, Saved Mapping) and produces DTOs + MappingConfig.
 */

import type { ColumnDefinition, MappingConfig } from '@/lib/import/engine/types';
import type {
  MappingReviewBaseline,
  MappingReviewBundle,
  MappingReviewCandidateViewModel,
  MappingReviewEditResult,
  MappingReviewEditState,
  MappingReviewEntry,
  MappingReviewRowViewModel,
  MappingReviewViewModel,
} from '@/lib/import/mapping-review/types';
import type { ReportDetectionResult } from '@/lib/import/reports/types';
import type { AutoMappingResult, AmbiguousMapping } from '@/lib/import/services/auto-mapping';
import type { ResolveImportMappingResult } from '@/lib/import/services/saved-mapping.service';
import type { ImportAutoMappingSnapshot } from '@/types/import';

export type BuildMappingReviewInput = {
  headers: readonly string[];
  columns: readonly ColumnDefinition[];
  reportDetection: ReportDetectionResult;
  autoMapping: AutoMappingResult;
  resolved: ResolveImportMappingResult;
  /** When set (revalidate path), reflects the user's explicit mapping. */
  userMapping?: MappingConfig;
};

/** Builds the Mapping Review bundle from pipeline outputs. */
export function buildMappingReviewBundle(input: BuildMappingReviewInput): MappingReviewBundle {
  const labelByField = new Map(input.columns.map((column) => [column.field, column.label]));
  const appliedByHeader = buildAppliedLookup(input.resolved, input.userMapping);
  const autoByHeader = new Map(
    input.autoMapping.mappedFields.map((field) => [field.sourceHeader, field]),
  );
  const ambiguousByHeader = new Map(
    input.autoMapping.ambiguousMappings.map((entry) => [entry.sourceHeader, entry]),
  );
  const ignoredSet = new Set(input.autoMapping.ignoredHeaders);

  const rows: MappingReviewRowViewModel[] = input.headers.map((sourceHeader) =>
    buildRowViewModel({
      sourceHeader,
      appliedByHeader,
      autoByHeader,
      ambiguousByHeader,
      ignoredSet,
      labelByField,
    }),
  );

  const baseline = createEditStateFromRows(rows);
  const viewModel = buildViewModelFromReport({
    rows,
    reportDetection: input.reportDetection,
    mappingConfidence: input.userMapping
      ? computeUserMappingConfidence(rows, input.columns)
      : input.resolved.confidence,
  });

  return {
    viewModel,
    baseline,
    reportType: input.reportDetection.profile.reportType,
  };
}

export function createEditStateFromRows(
  rows: readonly MappingReviewRowViewModel[],
): MappingReviewEditState {
  const entries: Record<string, MappingReviewEntry> = {};

  for (const row of rows) {
    entries[row.sourceHeader] = rowToEntry(row);
  }

  return { entries };
}

export function changeMappedTargetField(
  state: MappingReviewEditState,
  bundle: MappingReviewBundle,
  columns: readonly ColumnDefinition[],
  sourceHeader: string,
  targetField: string,
): MappingReviewEditResult {
  return applyEdit(state, bundle, columns, (entries) => {
    releaseFieldClaim(entries, targetField, sourceHeader);
    entries[sourceHeader] = { kind: 'mapped', targetField, origin: 'manual' };
    return entries;
  });
}

export function resolveAmbiguousMapping(
  state: MappingReviewEditState,
  bundle: MappingReviewBundle,
  columns: readonly ColumnDefinition[],
  sourceHeader: string,
  targetField: string,
): MappingReviewEditResult {
  return changeMappedTargetField(state, bundle, columns, sourceHeader, targetField);
}

export function ignoreSourceHeader(
  state: MappingReviewEditState,
  bundle: MappingReviewBundle,
  columns: readonly ColumnDefinition[],
  sourceHeader: string,
): MappingReviewEditResult {
  return applyEdit(state, bundle, columns, (entries) => {
    entries[sourceHeader] = { kind: 'ignored' };
    return entries;
  });
}

export function restoreAutoSuggestion(
  state: MappingReviewEditState,
  bundle: MappingReviewBundle,
  columns: readonly ColumnDefinition[],
  sourceHeader: string,
  autoMapping: AutoMappingResult | ImportAutoMappingSnapshot,
): MappingReviewEditResult {
  return applyEdit(state, bundle, columns, (entries) => {
    const autoField = autoMapping.mappedFields.find((field) => field.sourceHeader === sourceHeader);

    if (autoField) {
      releaseFieldClaim(entries, autoField.targetField, sourceHeader);
      entries[sourceHeader] = {
        kind: 'mapped',
        targetField: autoField.targetField,
        origin: 'auto',
      };
      return entries;
    }

    const ambiguous = autoMapping.ambiguousMappings.find(
      (entry) => entry.sourceHeader === sourceHeader,
    );

    if (ambiguous) {
      entries[sourceHeader] = {
        kind: 'ambiguous',
        candidateFields: ambiguous.candidates.map((candidate) => candidate.targetField),
      };
      return entries;
    }

    if (autoMapping.ignoredHeaders.includes(sourceHeader)) {
      entries[sourceHeader] = { kind: 'ignored' };
      return entries;
    }

    entries[sourceHeader] = { kind: 'unmapped' };
    return entries;
  });
}

export function resetAllMappingReview(
  baseline: MappingReviewBaseline,
  bundle: MappingReviewBundle,
  columns: readonly ColumnDefinition[],
): MappingReviewEditResult {
  const state: MappingReviewEditState = {
    entries: { ...baseline.entries },
  };

  return {
    state,
    mapping: mappingReviewStateToConfig(state),
    viewModel: rebuildViewModel(state, bundle.viewModel, columns),
  };
}

export function mappingReviewStateToConfig(state: MappingReviewEditState): MappingConfig {
  const columnMappings = Object.entries(state.entries)
    .filter(([, entry]) => entry.kind === 'mapped')
    .map(([sourceHeader, entry]) => ({
      sourceHeader,
      targetField: (entry as Extract<MappingReviewEntry, { kind: 'mapped' }>).targetField,
    }));

  return { columnMappings };
}

export function rebuildViewModel(
  state: MappingReviewEditState,
  previous: MappingReviewViewModel,
  columns: readonly ColumnDefinition[],
): MappingReviewViewModel {
  const labelByField = new Map(columns.map((column) => [column.field, column.label]));

  const rows = previous.rows.map((row) => {
    const entry = state.entries[row.sourceHeader] ?? { kind: 'unmapped' as const };
    return entryToRowViewModel(row.sourceHeader, entry, row, labelByField);
  });

  return {
    ...previous,
    rows,
    mappedHeaders: rows.filter((row) => row.status === 'mapped').map((row) => row.sourceHeader),
    unmappedHeaders: rows.filter((row) => row.status === 'unmapped').map((row) => row.sourceHeader),
    ignoredHeaders: rows.filter((row) => row.status === 'ignored').map((row) => row.sourceHeader),
    ambiguousHeaders: rows
      .filter((row) => row.status === 'ambiguous')
      .map((row) => row.sourceHeader),
    mappingConfidence: computeUserMappingConfidence(rows, columns),
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function applyEdit(
  state: MappingReviewEditState,
  bundle: MappingReviewBundle,
  columns: readonly ColumnDefinition[],
  mutate: (entries: Record<string, MappingReviewEntry>) => Record<string, MappingReviewEntry>,
): MappingReviewEditResult {
  const nextState: MappingReviewEditState = {
    entries: mutate({ ...state.entries }),
  };

  return {
    state: nextState,
    mapping: mappingReviewStateToConfig(nextState),
    viewModel: rebuildViewModel(nextState, bundle.viewModel, columns),
  };
}

function buildAppliedLookup(
  resolved: ResolveImportMappingResult,
  userMapping?: MappingConfig,
): Map<string, { targetField: string; source: 'saved' | 'auto' | 'manual' }> {
  const map = new Map<string, { targetField: string; source: 'saved' | 'auto' | 'manual' }>();

  if (userMapping) {
    for (const entry of userMapping.columnMappings) {
      map.set(entry.sourceHeader, { targetField: entry.targetField, source: 'manual' });
    }

    return map;
  }

  for (const entry of resolved.appliedMappings) {
    map.set(entry.sourceHeader, {
      targetField: entry.targetField,
      source: entry.source,
    });
  }

  return map;
}

function buildRowViewModel(input: {
  sourceHeader: string;
  appliedByHeader: Map<string, { targetField: string; source: 'saved' | 'auto' | 'manual' }>;
  autoByHeader: Map<string, { targetField: string; score: number }>;
  ambiguousByHeader: Map<string, AmbiguousMapping>;
  ignoredSet: Set<string>;
  labelByField: Map<string, string>;
}): MappingReviewRowViewModel {
  const {
    sourceHeader,
    appliedByHeader,
    autoByHeader,
    ambiguousByHeader,
    ignoredSet,
    labelByField,
  } = input;

  const applied = appliedByHeader.get(sourceHeader);

  if (applied) {
    return {
      sourceHeader,
      status: 'mapped',
      targetField: applied.targetField,
      targetFieldLabel: labelByField.get(applied.targetField) ?? applied.targetField,
      mappingSource: applied.source,
      autoSuggestion: toSuggestion(autoByHeader.get(sourceHeader), labelByField),
      ambiguousCandidates: [],
    };
  }

  const ambiguous = ambiguousByHeader.get(sourceHeader);

  if (ambiguous) {
    return {
      sourceHeader,
      status: 'ambiguous',
      targetField: null,
      targetFieldLabel: null,
      mappingSource: null,
      autoSuggestion: null,
      ambiguousCandidates: ambiguous.candidates.map((candidate) => ({
        targetField: candidate.targetField,
        label: labelByField.get(candidate.targetField) ?? candidate.targetField,
        score: candidate.score,
      })),
    };
  }

  if (ignoredSet.has(sourceHeader)) {
    return {
      sourceHeader,
      status: 'ignored',
      targetField: null,
      targetFieldLabel: null,
      mappingSource: null,
      autoSuggestion: toSuggestion(autoByHeader.get(sourceHeader), labelByField),
      ambiguousCandidates: [],
    };
  }

  return {
    sourceHeader,
    status: 'unmapped',
    targetField: null,
    targetFieldLabel: null,
    mappingSource: null,
    autoSuggestion: toSuggestion(autoByHeader.get(sourceHeader), labelByField),
    ambiguousCandidates: [],
  };
}

/** Friendly label when report detection returns the Unknown profile (Phase U1). */
export const CUSTOM_SPREADSHEET_DISPLAY_NAME = 'Custom Spreadsheet';

function buildViewModelFromReport(input: {
  rows: readonly MappingReviewRowViewModel[];
  reportDetection: ReportDetectionResult;
  mappingConfidence: number;
}): MappingReviewViewModel {
  const reportType = input.reportDetection.profile.reportType;

  return {
    reportDisplayName:
      reportType === 'unknown'
        ? CUSTOM_SPREADSHEET_DISPLAY_NAME
        : input.reportDetection.profile.displayName,
    reportConfidence: input.reportDetection.confidence,
    mappingConfidence: clamp01(input.mappingConfidence),
    rows: input.rows,
    mappedHeaders: input.rows.filter((row) => row.status === 'mapped').map((row) => row.sourceHeader),
    unmappedHeaders: input.rows
      .filter((row) => row.status === 'unmapped')
      .map((row) => row.sourceHeader),
    ignoredHeaders: input.rows
      .filter((row) => row.status === 'ignored')
      .map((row) => row.sourceHeader),
    ambiguousHeaders: input.rows
      .filter((row) => row.status === 'ambiguous')
      .map((row) => row.sourceHeader),
    canSaveMapping: reportType !== 'unknown' && input.reportDetection.confidence >= 0.4,
    reportType,
  };
}

function toSuggestion(
  auto: { targetField: string; score: number } | undefined,
  labelByField: Map<string, string>,
): MappingReviewCandidateViewModel | null {
  if (!auto) {
    return null;
  }

  return {
    targetField: auto.targetField,
    label: labelByField.get(auto.targetField) ?? auto.targetField,
    score: auto.score,
  };
}

function rowToEntry(row: MappingReviewRowViewModel): MappingReviewEntry {
  switch (row.status) {
    case 'mapped':
      return {
        kind: 'mapped',
        targetField: row.targetField!,
        origin: row.mappingSource ?? 'manual',
      };
    case 'ignored':
      return { kind: 'ignored' };
    case 'ambiguous':
      return {
        kind: 'ambiguous',
        candidateFields: row.ambiguousCandidates.map((candidate) => candidate.targetField),
      };
    default:
      return { kind: 'unmapped' };
  }
}

function entryToRowViewModel(
  sourceHeader: string,
  entry: MappingReviewEntry,
  previous: MappingReviewRowViewModel,
  labelByField: Map<string, string>,
): MappingReviewRowViewModel {
  switch (entry.kind) {
    case 'mapped':
      return {
        ...previous,
        status: 'mapped',
        targetField: entry.targetField,
        targetFieldLabel: labelByField.get(entry.targetField) ?? entry.targetField,
        mappingSource: entry.origin,
        ambiguousCandidates: [],
      };
    case 'ignored':
      return {
        ...previous,
        status: 'ignored',
        targetField: null,
        targetFieldLabel: null,
        mappingSource: null,
        ambiguousCandidates: [],
      };
    case 'ambiguous':
      return {
        ...previous,
        status: 'ambiguous',
        targetField: null,
        targetFieldLabel: null,
        mappingSource: null,
        ambiguousCandidates: previous.ambiguousCandidates.filter((candidate) =>
          entry.candidateFields.includes(candidate.targetField),
        ),
      };
    default:
      return {
        ...previous,
        status: 'unmapped',
        targetField: null,
        targetFieldLabel: null,
        mappingSource: null,
        ambiguousCandidates: [],
      };
  }
}

function computeUserMappingConfidence(
  rows: readonly MappingReviewRowViewModel[],
  columns: readonly ColumnDefinition[],
): number {
  if (rows.length === 0) {
    return 0;
  }

  const mapped = rows.filter((row) => row.status === 'mapped').length;
  const ambiguous = rows.filter((row) => row.status === 'ambiguous').length;
  const requiredFields = columns.filter((column) => column.required).map((column) => column.field);
  const mappedFields = new Set(
    rows.filter((row) => row.status === 'mapped').map((row) => row.targetField),
  );
  const requiredHit =
    requiredFields.length === 0
      ? 1
      : requiredFields.filter((field) => mappedFields.has(field)).length / requiredFields.length;

  const coverage = mapped / rows.length;
  const ambiguityPenalty = ambiguous / rows.length;

  return clamp01(coverage * 0.6 + requiredHit * 0.3 + (1 - ambiguityPenalty) * 0.1);
}

function releaseFieldClaim(
  entries: Record<string, MappingReviewEntry>,
  targetField: string,
  exceptHeader: string,
): void {
  for (const [header, entry] of Object.entries(entries)) {
    if (header === exceptHeader) {
      continue;
    }

    if (entry.kind === 'mapped' && entry.targetField === targetField) {
      entries[header] = { kind: 'unmapped' };
    }
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
