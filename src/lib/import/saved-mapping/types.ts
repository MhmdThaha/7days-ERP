/**
 * Saved Mapping contracts — org-scoped remembered column mappings.
 *
 * Identified by (organizationId, entity, reportType). Pure data; no vendors,
 * no React, no Firestore types in this module.
 */

export const SAVED_MAPPING_SCHEMA_VERSION = 1;

/** One remembered header → field pair. */
export type SavedColumnMapping = {
  sourceHeader: string;
  targetField: string;
  /** Optional metadata for diagnostics / future UI. */
  metadata?: {
    /** How this pair was approved. */
    approvedFrom?: 'auto' | 'manual' | 'import';
    /** Normalized header key at save time. */
    normalizedSourceHeader?: string;
  };
};

/** Persisted Saved Mapping document (domain shape). */
export type SavedMappingDocument = {
  organizationId: string;
  /** Import entity key, e.g. "product" | "sale". */
  entity: string;
  /** Report type from Report Detection, e.g. "sales-summary". */
  reportType: string;
  /** Schema version of this document. */
  version: number;
  mappings: readonly SavedColumnMapping[];
  createdAt: Date;
  lastUsedAt: Date;
  updatedAt?: Date;
};

export type AppliedMappingEntry = {
  sourceHeader: string;
  targetField: string;
  /** Whether the pair came from the saved profile or fresh auto-mapping. */
  source: 'saved' | 'auto';
};

export type SkippedMappingEntry = {
  sourceHeader: string;
  targetField: string;
  reason: 'missing_header';
};

export type OutdatedMappingEntry = {
  sourceHeader: string;
  targetField: string;
  reason: 'unknown_target_field' | 'version_mismatch';
};

/**
 * Result of merging Auto Mapping with an optional Saved Mapping.
 * Final `mapping` is what the import pipeline should use.
 */
export type SavedMappingResult = {
  appliedMappings: readonly AppliedMappingEntry[];
  skippedMappings: readonly SkippedMappingEntry[];
  outdatedMappings: readonly OutdatedMappingEntry[];
  /** Headers still without a mapping after merge (need attention later). */
  newMappingsNeeded: readonly string[];
  confidence: number;
  /** True when a saved document was present and at least partly considered. */
  usedSavedMapping: boolean;
  /** True when saved.version !== current schema version (still applied gracefully). */
  versionMismatch: boolean;
  savedMappingVersion: number | null;
};
