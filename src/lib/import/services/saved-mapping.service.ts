/**
 * Saved Mapping service — merge remembered mappings with Auto Mapping.
 *
 * Flow (caller responsibility for I/O):
 *   1. Run Auto Mapping first
 *   2. Load Saved Mapping for (org, entity, reportType) if any
 *   3. applySavedMapping(...) — validate, prefer saved, fall back to auto
 *
 * Pure: no Firestore, no React, no vendor / report-name branches.
 */

import type { ColumnDefinition, MappingConfig } from '@/lib/import/engine/types';
import type { AutoMappingResult } from '@/lib/import/services/auto-mapping';
import { normalizeHeaderLabel } from '@/lib/import/services/header-detection.service';
import {
  SAVED_MAPPING_SCHEMA_VERSION,
  type AppliedMappingEntry,
  type OutdatedMappingEntry,
  type SavedMappingDocument,
  type SavedMappingResult,
  type SkippedMappingEntry,
} from '@/lib/import/saved-mapping/types';

export type ApplySavedMappingInput = {
  headers: readonly string[];
  columns: readonly ColumnDefinition[];
  /** Result of Auto Mapping (always computed first). */
  autoMapping: AutoMappingResult;
  /** Loaded Saved Mapping, or null when none exists. */
  savedMapping: SavedMappingDocument | null;
  /** Override schema version for tests. Defaults to SAVED_MAPPING_SCHEMA_VERSION. */
  currentVersion?: number;
};

export type ResolveImportMappingResult = SavedMappingResult & {
  /** Engine-ready mapping after merge. */
  mapping: MappingConfig;
  explanation: string[];
};

/**
 * Merges Auto Mapping with an optional Saved Mapping.
 *
 * Rules:
 * - Saved pairs whose source header is absent → skipped
 * - Saved pairs whose target field is unknown → outdated
 * - Version mismatch → still apply valid pairs; flag + lower confidence
 * - Remaining headers → Auto Mapping fallback
 * - No saved mapping → Auto Mapping only
 */
export function applySavedMapping(input: ApplySavedMappingInput): ResolveImportMappingResult {
  const {
    headers,
    columns,
    autoMapping,
    savedMapping,
    currentVersion = SAVED_MAPPING_SCHEMA_VERSION,
  } = input;

  const validFields = new Set(columns.map((column) => column.field));
  const headerByNormalized = buildHeaderLookup(headers);
  const explanation: string[] = [];

  if (!savedMapping) {
    explanation.push('No Saved Mapping found; using Auto Mapping only.');
    return {
      ...fromAutoOnly(autoMapping),
      mapping: autoMapping.mapping,
      explanation,
    };
  }

  const versionMismatch = savedMapping.version !== currentVersion;
  if (versionMismatch) {
    explanation.push(
      `Saved Mapping version ${savedMapping.version} differs from current ${currentVersion}; applying compatible pairs gracefully.`,
    );
  } else {
    explanation.push(
      `Applying Saved Mapping v${savedMapping.version} for entity "${savedMapping.entity}" / reportType "${savedMapping.reportType}".`,
    );
  }

  const appliedMappings: AppliedMappingEntry[] = [];
  const skippedMappings: SkippedMappingEntry[] = [];
  const outdatedMappings: OutdatedMappingEntry[] = [];
  const claimedFields = new Set<string>();
  const claimedHeaders = new Set<string>();

  if (versionMismatch) {
    outdatedMappings.push({
      sourceHeader: '*',
      targetField: '*',
      reason: 'version_mismatch',
    });
  }

  for (const entry of savedMapping.mappings) {
    const resolvedHeader = resolveHeader(entry.sourceHeader, headerByNormalized, headers);

    if (!resolvedHeader) {
      skippedMappings.push({
        sourceHeader: entry.sourceHeader,
        targetField: entry.targetField,
        reason: 'missing_header',
      });
      continue;
    }

    if (!validFields.has(entry.targetField)) {
      outdatedMappings.push({
        sourceHeader: entry.sourceHeader,
        targetField: entry.targetField,
        reason: 'unknown_target_field',
      });
      continue;
    }

    if (claimedFields.has(entry.targetField) || claimedHeaders.has(resolvedHeader)) {
      // Deterministic: first saved claim wins; later duplicates treated as outdated.
      outdatedMappings.push({
        sourceHeader: entry.sourceHeader,
        targetField: entry.targetField,
        reason: 'unknown_target_field',
      });
      continue;
    }

    claimedFields.add(entry.targetField);
    claimedHeaders.add(resolvedHeader);
    appliedMappings.push({
      sourceHeader: resolvedHeader,
      targetField: entry.targetField,
      source: 'saved',
    });
  }

  // Fall back to Auto Mapping for headers not yet claimed.
  for (const auto of autoMapping.mappedFields) {
    if (claimedHeaders.has(auto.sourceHeader)) {
      continue;
    }

    if (claimedFields.has(auto.targetField)) {
      continue;
    }

    claimedFields.add(auto.targetField);
    claimedHeaders.add(auto.sourceHeader);
    appliedMappings.push({
      sourceHeader: auto.sourceHeader,
      targetField: auto.targetField,
      source: 'auto',
    });
  }

  const mappedHeaderSet = new Set(appliedMappings.map((entry) => entry.sourceHeader));
  const newMappingsNeeded = headers.filter((header) => {
    if (mappedHeaderSet.has(header)) {
      return false;
    }

    // Intentionally ignored by profile-aware auto-map — not "needed".
    if (autoMapping.ignoredHeaders.includes(header)) {
      return false;
    }

    return true;
  });

  // Ambiguous auto headers that were not resolved by saved still need attention.
  for (const ambiguous of autoMapping.ambiguousMappings) {
    if (!mappedHeaderSet.has(ambiguous.sourceHeader) && !newMappingsNeeded.includes(ambiguous.sourceHeader)) {
      newMappingsNeeded.push(ambiguous.sourceHeader);
    }
  }

  const confidence = computeConfidence({
    autoConfidence: autoMapping.mappingConfidence,
    appliedCount: appliedMappings.length,
    savedAppliedCount: appliedMappings.filter((entry) => entry.source === 'saved').length,
    skippedCount: skippedMappings.length,
    outdatedCount: outdatedMappings.filter((entry) => entry.reason !== 'version_mismatch').length,
    newNeededCount: newMappingsNeeded.length,
    headerCount: headers.length,
    versionMismatch,
    usedSaved: true,
  });

  explanation.push(
    `Applied ${appliedMappings.filter((e) => e.source === 'saved').length} saved + ` +
      `${appliedMappings.filter((e) => e.source === 'auto').length} auto mapping(s); ` +
      `${skippedMappings.length} skipped; ${outdatedMappings.length} outdated; ` +
      `${newMappingsNeeded.length} still needed.`,
  );
  explanation.push(`Resolved mapping confidence ${confidence.toFixed(2)}.`);

  return {
    appliedMappings,
    skippedMappings,
    outdatedMappings,
    newMappingsNeeded,
    confidence,
    usedSavedMapping: true,
    versionMismatch,
    savedMappingVersion: savedMapping.version,
    mapping: {
      columnMappings: appliedMappings.map((entry) => ({
        sourceHeader: entry.sourceHeader,
        targetField: entry.targetField,
      })),
    },
    explanation,
  };
}

/** Builds a SavedMappingDocument payload for persistence (timestamps as Date). */
export function buildSavedMappingDocument(input: {
  organizationId: string;
  entity: string;
  reportType: string;
  mappings: readonly { sourceHeader: string; targetField: string }[];
  version?: number;
  approvedFrom?: 'auto' | 'manual' | 'import';
  now?: Date;
  existing?: SavedMappingDocument | null;
}): SavedMappingDocument {
  const now = input.now ?? new Date();
  const version = input.version ?? SAVED_MAPPING_SCHEMA_VERSION;

  return {
    organizationId: input.organizationId,
    entity: input.entity,
    reportType: input.reportType,
    version,
    mappings: input.mappings.map((mapping) => ({
      sourceHeader: mapping.sourceHeader,
      targetField: mapping.targetField,
      metadata: {
        approvedFrom: input.approvedFrom ?? 'manual',
        normalizedSourceHeader: normalizeHeaderLabel(mapping.sourceHeader),
      },
    })),
    createdAt: input.existing?.createdAt ?? now,
    lastUsedAt: now,
    updatedAt: now,
  };
}

/** Deterministic Firestore document id for (entity, reportType). */
export function savedMappingDocId(entity: string, reportType: string): string {
  return `${entity}__${reportType}`;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function fromAutoOnly(autoMapping: AutoMappingResult): SavedMappingResult {
  const appliedMappings: AppliedMappingEntry[] = autoMapping.mappedFields.map((field) => ({
    sourceHeader: field.sourceHeader,
    targetField: field.targetField,
    source: 'auto',
  }));

  const newMappingsNeeded = [
    ...autoMapping.unmappedHeaders,
    ...autoMapping.ambiguousMappings.map((entry) => entry.sourceHeader),
  ];

  return {
    appliedMappings,
    skippedMappings: [],
    outdatedMappings: [],
    newMappingsNeeded,
    confidence: autoMapping.mappingConfidence,
    usedSavedMapping: false,
    versionMismatch: false,
    savedMappingVersion: null,
  };
}

function buildHeaderLookup(headers: readonly string[]): Map<string, string> {
  const map = new Map<string, string>();

  for (const header of headers) {
    const key = normalizeHeaderLabel(header);
    if (!map.has(key)) {
      map.set(key, header);
    }
  }

  return map;
}

function resolveHeader(
  savedHeader: string,
  headerByNormalized: Map<string, string>,
  headers: readonly string[],
): string | null {
  if (headers.includes(savedHeader)) {
    return savedHeader;
  }

  return headerByNormalized.get(normalizeHeaderLabel(savedHeader)) ?? null;
}

function computeConfidence(input: {
  autoConfidence: number;
  appliedCount: number;
  savedAppliedCount: number;
  skippedCount: number;
  outdatedCount: number;
  newNeededCount: number;
  headerCount: number;
  versionMismatch: boolean;
  usedSaved: boolean;
}): number {
  if (input.headerCount === 0) {
    return 0;
  }

  if (!input.usedSaved) {
    return clamp01(input.autoConfidence);
  }

  const coverage = input.appliedCount / input.headerCount;
  const savedRatio =
    input.appliedCount === 0 ? 0 : input.savedAppliedCount / input.appliedCount;
  const problemPenalty =
    (input.skippedCount + input.outdatedCount + input.newNeededCount) / Math.max(input.headerCount, 1);

  let confidence = coverage * 0.55 + savedRatio * 0.3 + (1 - Math.min(problemPenalty, 1)) * 0.15;

  // Blend with auto confidence so strong auto fallback still counts.
  confidence = confidence * 0.7 + input.autoConfidence * 0.3;

  if (input.versionMismatch) {
    confidence *= 0.85;
  }

  return clamp01(Math.round(confidence * 1000) / 1000);
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}
