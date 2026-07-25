/**
 * Report Detection — classifies a spreadsheet structure from detected headers.
 *
 * Runs after Header Detection and before Auto Mapping. Evaluates every
 * Report Definition (profile) for the target entity and returns the full
 * winning profile as the single source of truth for later phases.
 *
 * Pure: no React, no Firestore, no UI copy, no vendor hardcoding.
 */

import { normalizeHeaderLabel } from '@/lib/import/services/header-detection.service';
import { BUILTIN_REPORT_DEFINITIONS } from '@/lib/import/reports/definitions';
import {
  UNKNOWN_REPORT,
  type ReportCandidateScore,
  type ReportConfidenceWeights,
  type ReportCoverage,
  type ReportDefinition,
  type ReportDetectionResult,
  type ReportEntitySupport,
  type ReportFieldRequirement,
} from '@/lib/import/reports/types';

const DEFAULT_WEIGHTS: Required<ReportConfidenceWeights> = {
  requiredWeight: 0.7,
  optionalWeight: 0.25,
  matchedFileWeight: 0.05,
  missingRequiredFactor: 0.45,
};

/** Below this confidence, classify as Unknown even if a definition scored highest. */
export const DEFAULT_UNKNOWN_CONFIDENCE_THRESHOLD = 0.4;

export type DetectReportOptions = {
  /** Restrict definitions to this entity (required for production imports). */
  entityType: ReportEntitySupport;
  /** Override the built-in registry (tests / future org overlays). */
  definitions?: readonly ReportDefinition[];
  /** Confidence floor for accepting a match. Defaults to 0.4. */
  unknownConfidenceThreshold?: number;
};

/**
 * Scores every eligible Report Definition against `headers` and returns the
 * best match (full profile), or the Unknown profile when confidence is low.
 */
export function detectReport(
  headers: readonly string[],
  options: DetectReportOptions,
): ReportDetectionResult {
  const threshold = options.unknownConfidenceThreshold ?? DEFAULT_UNKNOWN_CONFIDENCE_THRESHOLD;
  const definitions = (options.definitions ?? BUILTIN_REPORT_DEFINITIONS).filter(
    (definition) => definition.supportedEntity === options.entityType,
  );

  const normalizedFile = headers.map((header) => ({
    original: header,
    normalized: normalizeHeaderLabel(header),
  }));

  const candidates: ReportCandidateScore[] = definitions.map((definition) => {
    const coverage = buildCoverage(definition, normalizedFile);
    const defaultConfidence = calculateDefaultConfidence(definition, coverage);
    const confidence = clamp01(
      definition.calculateConfidence
        ? definition.calculateConfidence(coverage, defaultConfidence)
        : defaultConfidence,
    );

    return {
      definitionId: definition.id,
      displayName: definition.displayName,
      confidence,
      coverage,
    };
  });

  candidates.sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }

    const missingDelta =
      a.coverage.missingRequiredKeys.length - b.coverage.missingRequiredKeys.length;

    if (missingDelta !== 0) {
      return missingDelta;
    }

    return b.coverage.matchedFileHeaders.length - a.coverage.matchedFileHeaders.length;
  });

  const best = candidates[0];
  const winningDefinition =
    best && best.confidence >= threshold
      ? definitions.find((definition) => definition.id === best.definitionId)
      : undefined;

  if (!best || !winningDefinition) {
    return buildUnknownResult(headers, candidates, threshold, options.entityType);
  }

  return buildMatchResult(winningDefinition, best, candidates);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

type NormalizedHeader = { original: string; normalized: string };

function buildCoverage(
  definition: ReportDefinition,
  fileHeaders: readonly NormalizedHeader[],
): ReportCoverage {
  const matchedRequiredKeys: string[] = [];
  const missingRequiredKeys: string[] = [];
  const matchedOptionalKeys: string[] = [];
  const matchedFileHeaders: string[] = [];
  const claimedNormalized = new Set<string>();

  const tryMatch = (
    requirement: ReportFieldRequirement,
    onMatch: () => void,
    onMiss?: () => void,
  ): void => {
    const aliasSet = new Set(requirement.aliases.map(normalizeHeaderLabel));
    const hit = fileHeaders.find(
      (header) =>
        !claimedNormalized.has(header.normalized) && aliasSet.has(header.normalized),
    );

    if (hit) {
      claimedNormalized.add(hit.normalized);
      matchedFileHeaders.push(hit.original);
      onMatch();
      return;
    }

    onMiss?.();
  };

  for (const requirement of definition.requiredFields) {
    tryMatch(
      requirement,
      () => matchedRequiredKeys.push(requirement.key),
      () => missingRequiredKeys.push(requirement.key),
    );
  }

  for (const requirement of definition.optionalFields) {
    tryMatch(requirement, () => matchedOptionalKeys.push(requirement.key));
  }

  const unmatchedFileHeaders = fileHeaders
    .filter((header) => !claimedNormalized.has(header.normalized))
    .map((header) => header.original);

  return {
    matchedRequiredKeys,
    missingRequiredKeys,
    matchedOptionalKeys,
    unmatchedFileHeaders,
    matchedFileHeaders,
    requiredTotal: definition.requiredFields.length,
    optionalTotal: definition.optionalFields.length,
    fileHeaderTotal: fileHeaders.length,
  };
}

/**
 * Default confidence:
 *
 *   requiredCoverage * W_req
 * + optionalCoverage * W_opt
 * + matchedFileRatio * W_file
 *
 * Then, if any required field is missing, multiply by missingRequiredFactor.
 */
export function calculateDefaultConfidence(
  definition: ReportDefinition,
  coverage: ReportCoverage,
): number {
  const weights = { ...DEFAULT_WEIGHTS, ...definition.confidence };

  const requiredCoverage =
    coverage.requiredTotal === 0
      ? 1
      : coverage.matchedRequiredKeys.length / coverage.requiredTotal;

  const optionalCoverage =
    coverage.optionalTotal === 0
      ? 0
      : coverage.matchedOptionalKeys.length / coverage.optionalTotal;

  const matchedFileRatio =
    coverage.fileHeaderTotal === 0
      ? 0
      : coverage.matchedFileHeaders.length / coverage.fileHeaderTotal;

  let confidence =
    requiredCoverage * weights.requiredWeight +
    optionalCoverage * weights.optionalWeight +
    matchedFileRatio * weights.matchedFileWeight;

  if (coverage.missingRequiredKeys.length > 0) {
    confidence *= weights.missingRequiredFactor;
  }

  return clamp01(confidence);
}

// ---------------------------------------------------------------------------
// Result builders
// ---------------------------------------------------------------------------

function buildMatchResult(
  definition: ReportDefinition,
  score: ReportCandidateScore,
  candidates: readonly ReportCandidateScore[],
): ReportDetectionResult {
  const missingHeaders = definition.requiredFields
    .filter((requirement) => score.coverage.missingRequiredKeys.includes(requirement.key))
    .map((requirement) => requirement.label);

  const explanation = [
    `Classified as ${definition.displayName} (${definition.id}) with confidence ${score.confidence.toFixed(2)}.`,
    `Report type: ${definition.reportType}; recommended mode: ${definition.recommendedImportMode}.`,
    `Matched required: ${score.coverage.matchedRequiredKeys.join(', ') || 'none'}.`,
    score.coverage.missingRequiredKeys.length > 0
      ? `Missing required: ${missingHeaders.join(', ')}.`
      : 'All required fields present.',
    `Matched optional: ${score.coverage.matchedOptionalKeys.join(', ') || 'none'}.`,
    `Unmatched file headers: ${score.coverage.unmatchedFileHeaders.length}.`,
    `Evaluated ${candidates.length} report definition(s) for this entity.`,
  ];

  return {
    profile: definition,
    confidence: score.confidence,
    matchedHeaders: score.coverage.matchedFileHeaders,
    missingHeaders,
    unmatchedHeaders: score.coverage.unmatchedFileHeaders,
    explanation,
    candidates,
  };
}

function buildUnknownResult(
  headers: readonly string[],
  candidates: readonly ReportCandidateScore[],
  threshold: number,
  entityType: ReportEntitySupport,
): ReportDetectionResult {
  const best = candidates[0];
  const explanation = [
    `No report definition met the confidence threshold (${threshold.toFixed(2)}) for entity "${entityType}".`,
    best
      ? `Best candidate was ${best.displayName} at ${best.confidence.toFixed(2)}.`
      : 'No report definitions were registered for this entity.',
    `File had ${headers.length} header column(s).`,
    `Returning Unknown profile (mode: ${UNKNOWN_REPORT.recommendedImportMode}).`,
  ];

  return {
    profile: UNKNOWN_REPORT,
    confidence: best?.confidence ?? 0,
    matchedHeaders: best?.coverage.matchedFileHeaders ?? [],
    missingHeaders: [],
    unmatchedHeaders: headers,
    explanation,
    candidates,
  };
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
