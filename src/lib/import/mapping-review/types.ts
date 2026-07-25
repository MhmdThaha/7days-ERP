/**
 * Mapping Review DTOs — client-safe view models for the Mapping Review UI.
 *
 * All mapping decisions are produced by import services; React components
 * only display and forward edit intents.
 */

import type { MappingConfig } from '@/lib/import/engine/types';

export type MappingReviewRowStatus = 'mapped' | 'unmapped' | 'ignored' | 'ambiguous';

export type MappingReviewCandidateViewModel = {
  targetField: string;
  label: string;
  score?: number;
};

export type MappingReviewRowViewModel = {
  sourceHeader: string;
  status: MappingReviewRowStatus;
  targetField: string | null;
  targetFieldLabel: string | null;
  /** How the current mapping was chosen (null when unmapped/ambiguous). */
  mappingSource: 'saved' | 'auto' | 'manual' | null;
  autoSuggestion: MappingReviewCandidateViewModel | null;
  ambiguousCandidates: readonly MappingReviewCandidateViewModel[];
};

export type MappingReviewViewModel = {
  reportDisplayName: string;
  reportConfidence: number;
  mappingConfidence: number;
  rows: readonly MappingReviewRowViewModel[];
  mappedHeaders: readonly string[];
  unmappedHeaders: readonly string[];
  ignoredHeaders: readonly string[];
  ambiguousHeaders: readonly string[];
  /** False when report type is unknown — nothing to persist. */
  canSaveMapping: boolean;
  reportType: string;
};

/** Per-header editable state — serializable for wizard + server round-trips. */
export type MappingReviewEntry =
  | {
      kind: 'mapped';
      targetField: string;
      origin: 'saved' | 'auto' | 'manual';
    }
  | { kind: 'ignored' }
  | { kind: 'unmapped' }
  | {
      kind: 'ambiguous';
      candidateFields: readonly string[];
    };

export type MappingReviewEditState = {
  entries: Record<string, MappingReviewEntry>;
};

/** Baseline returned from analyze — used for Reset all. */
export type MappingReviewBaseline = MappingReviewEditState;

export type MappingReviewBundle = {
  viewModel: MappingReviewViewModel;
  baseline: MappingReviewBaseline;
  reportType: string;
};

export type MappingReviewEditResult = {
  state: MappingReviewEditState;
  mapping: MappingConfig;
  viewModel: MappingReviewViewModel;
};
