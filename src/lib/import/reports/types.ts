/**
 * Report Definition (= Report Profile) contracts.
 *
 * One type is the single source of truth for report structure *and* business
 * meaning. Report Detection returns the full object; later phases (auto-map,
 * validation, UI, diagnostics) consume the same profile — never a parallel
 * "Report Profile" abstraction.
 *
 * Open/Closed: add a new report by registering a new definition only.
 */

/** Entities a report structure can target (includes future import types). */
export type ReportEntitySupport =
  | 'product'
  | 'sale'
  | 'purchase'
  | 'inventory'
  | 'unknown';

/** Structural / semantic report class (not a vendor). */
export type ReportType =
  | 'product-import'
  | 'sales-detail'
  | 'sales-summary'
  | 'item-summary'
  | 'purchase-detail'
  | 'unknown';

/**
 * How the commit / preview layer should treat a successful classification.
 * Data only — no UI strings required.
 */
export type RecommendedImportMode =
  | 'catalog-upsert'
  | 'line-item-commit'
  | 'document-history'
  | 'item-aggregate'
  | 'purchase-line-commit'
  | 'review-only';

/**
 * Capability flags — boolean data describing what the report *can* support.
 * Consumers check flags; they never branch on vendor names.
 */
export type ReportCapabilities = {
  readonly supportsInventory: boolean;
  readonly supportsInvoiceHistory: boolean;
  readonly supportsProductImport: boolean;
  readonly supportsPurchaseImport: boolean;
  readonly supportsFinancialHistory: boolean;
  readonly supportsProduction: boolean;
};

/** One required or optional field slot for a report structure. */
export type ReportFieldRequirement = {
  /** Stable key used in coverage math and explanations, e.g. "invoiceNumber". */
  key: string;
  /** Human-readable label for missing-field reporting. */
  label: string;
  /** Acceptable header spellings (normalized before compare). */
  aliases: readonly string[];
};

/**
 * @deprecated Use ReportFieldRequirement — kept as an alias so older call
 * sites compile during the rename from "headers" to "fields".
 */
export type ReportHeaderRequirement = ReportFieldRequirement;

/** Hints for validation / commit gating in later phases. */
export type ReportValidationHints = {
  /** Every data row should identify a product (name and/or code). */
  requireProductReference?: boolean;
  /** Quantity must be present and positive for commit. */
  requirePositiveQuantity?: boolean;
  /** When false, inventory mutation must be blocked. */
  allowInventoryMutation?: boolean;
  /** Prefer creating new catalog rows vs updating existing. */
  preferCreateOverUpdate?: boolean;
  /** Machine-readable codes future validators may emit. */
  issueCodes?: readonly string[];
};

/**
 * Hints consumed by profile-aware Auto Mapping.
 * Adding a report = set these on the Report Definition; do not branch in
 * the mapper on report ids or vendor names.
 */
export type ReportMappingHints = {
  /** Preferred entity field keys when resolving collisions / ranking. */
  preferredFieldOrder?: readonly string[];
  /** Extra header text → target field suggestions (boosted over plain synonyms). */
  synonymBoosts?: Readonly<Record<string, string>>;
  /** Entity fields this report must not map into. */
  ignoreFields?: readonly string[];
  /**
   * Entity field keys that should win ties more aggressively (typically
   * required import fields for this report structure).
   */
  requiredFieldPriority?: readonly string[];
};

/** Tunable weights for the default confidence formula. */
export type ReportConfidenceWeights = {
  /** Weight for required-field coverage. Default 0.7. */
  requiredWeight?: number;
  /** Weight for optional-field coverage. Default 0.25. */
  optionalWeight?: number;
  /** Weight for how much of the file is explained by the definition. Default 0.05. */
  matchedFileWeight?: number;
  /**
   * Multiplier applied when any required field is missing (0–1).
   * Default 0.45 — missing required fields sharply lower confidence.
   */
  missingRequiredFactor?: number;
};

/** Intermediate coverage facts passed to confidence calculation. */
export type ReportCoverage = {
  matchedRequiredKeys: readonly string[];
  missingRequiredKeys: readonly string[];
  matchedOptionalKeys: readonly string[];
  unmatchedFileHeaders: readonly string[];
  matchedFileHeaders: readonly string[];
  /** Field slots matched with their source header and similarity score. */
  matchedColumns: readonly ReportMatchedColumn[];
  /** Required or optional slots with no matching file header. */
  missingColumns: readonly ReportMissingColumn[];
  requiredTotal: number;
  optionalTotal: number;
  fileHeaderTotal: number;
};

export type ReportMatchedColumn = {
  key: string;
  label: string;
  header: string;
  required: boolean;
  /** Normalized header similarity score in [0, 1]. */
  similarity: number;
};

export type ReportMissingColumn = {
  key: string;
  label: string;
  required: boolean;
};

/**
 * Report Definition / Profile — single source of truth.
 *
 * Describes structure (fields) and business meaning (capabilities, modes,
 * hints). Adding a report = add one of these to the registry.
 */
export type ReportDefinition = {
  id: string;
  displayName: string;
  supportedEntity: ReportEntitySupport;
  reportType: ReportType;
  requiredFields: readonly ReportFieldRequirement[];
  optionalFields: readonly ReportFieldRequirement[];
  capabilities: ReportCapabilities;
  recommendedImportMode: RecommendedImportMode;
  validationHints: ReportValidationHints;
  mappingHints: ReportMappingHints;
  /** Confidence weights; omitted fields use detector defaults. */
  confidence?: ReportConfidenceWeights;
  /**
   * Optional override for confidence. Receives coverage + the score from
   * the default formula so definitions can refine without rewriting math.
   */
  calculateConfidence?: (coverage: ReportCoverage, defaultConfidence: number) => number;
};

/**
 * Alias emphasizing that ReportDefinition *is* the profile.
 * Do not create a separate ReportProfile type with different fields.
 */
export type ReportProfile = ReportDefinition;

export type ReportCandidateScore = {
  definitionId: string;
  displayName: string;
  confidence: number;
  coverage: ReportCoverage;
};

export type ReportDetectionResult = {
  /**
   * Complete Report Definition / Profile — single source of truth for
   * Auto Mapping, Validation, UI, and Diagnostics in later phases.
   */
  profile: ReportDefinition;
  /** Structural report class from the winning profile. */
  reportType: ReportType;
  confidence: number;
  /** Required and optional field slots matched in the file. */
  matchedColumns: readonly ReportMatchedColumn[];
  /** Required and optional field slots not found in the file. */
  missingColumns: readonly ReportMissingColumn[];
  /** File headers that matched at least one required/optional slot. */
  matchedHeaders: readonly string[];
  /** Required slot labels that were not found in the file. */
  missingHeaders: readonly string[];
  /** File headers that matched no slot on the winning definition. */
  unmatchedHeaders: readonly string[];
  /** Human-readable explanation of the classification. */
  explanation: string[];
  /** All scored candidates (entity-filtered), highest first. */
  candidates: readonly ReportCandidateScore[];
};

/** All capability flags off — used by Unknown and as a base for spreads. */
export const EMPTY_CAPABILITIES: ReportCapabilities = {
  supportsInventory: false,
  supportsInvoiceHistory: false,
  supportsProductImport: false,
  supportsPurchaseImport: false,
  supportsFinancialHistory: false,
  supportsProduction: false,
};

export function createCapabilities(
  overrides: Partial<ReportCapabilities> = {},
): ReportCapabilities {
  return { ...EMPTY_CAPABILITIES, ...overrides };
}

/** Fallback profile when no definition meets the confidence threshold. */
export const UNKNOWN_REPORT: ReportDefinition = {
  id: 'unknown',
  displayName: 'Unknown',
  supportedEntity: 'unknown',
  reportType: 'unknown',
  requiredFields: [],
  optionalFields: [],
  capabilities: EMPTY_CAPABILITIES,
  recommendedImportMode: 'review-only',
  validationHints: {
    allowInventoryMutation: false,
    issueCodes: ['UNKNOWN_REPORT_STRUCTURE'],
  },
  mappingHints: {},
};

/**
 * @deprecated Use `profile` on ReportDetectionResult. Kept as a type alias
 * so older docs referring to DetectedReport still resolve.
 */
export type DetectedReport = ReportDefinition;
