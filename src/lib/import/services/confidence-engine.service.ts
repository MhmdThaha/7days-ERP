/**
 * Import Confidence Engine — combines report detection, product matching, and
 * conflict classification into a final 0–100 confidence score per row.
 *
 * Pure scoring only: no import execution, Firestore access, or UI dependencies.
 */

import type { ReportDetectionResult } from '@/lib/import/reports/types';
import {
  CONFLICT_ENGINE_STATUS,
  IMPORT_CONFLICT_CODE,
  type ConflictEngineResult,
  type ImportConflictCode,
  type ImportConflictEntry,
} from '@/lib/import/services/conflict-engine.service';
import {
  PRODUCT_MATCH_STATUS,
  type ProductMatchResult,
} from '@/lib/import/services/product-matching.service';

// ---------------------------------------------------------------------------
// Output model
// ---------------------------------------------------------------------------

export const CONFIDENCE_LEVEL = {
  VERY_HIGH: 'VERY_HIGH',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  VERY_LOW: 'VERY_LOW',
} as const;

export type ConfidenceLevel = (typeof CONFIDENCE_LEVEL)[keyof typeof CONFIDENCE_LEVEL];

export const AUTO_IMPORT_RECOMMENDATION = {
  AUTO_IMPORT: 'AUTO_IMPORT',
  PREVIEW_FIRST: 'PREVIEW_FIRST',
  USER_CONFIRMATION: 'USER_CONFIRMATION',
  BLOCK_IMPORT: 'BLOCK_IMPORT',
} as const;

export type AutoImportRecommendation =
  (typeof AUTO_IMPORT_RECOMMENDATION)[keyof typeof AUTO_IMPORT_RECOMMENDATION];

export type ConfidenceEngineResult = {
  /** Final score in [0, 100]. */
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  confidenceReasons: readonly string[];
  autoImportRecommendation: AutoImportRecommendation;
};

export type ConfidenceEngineInput = {
  reportDetectionResult?: ReportDetectionResult | null;
  productMatchResult?: ProductMatchResult | null;
  conflictEngineResult?: ConflictEngineResult | null;
  /** When true, the row is empty and scores 0. */
  isBlankRow?: boolean;
};

// ---------------------------------------------------------------------------
// Scoring constants (Phase 5 spec)
// ---------------------------------------------------------------------------

export const PRODUCT_MATCH_SCORE = {
  BARCODE: 60,
  SAVED_MAPPING: 55,
  EXACT_NAME: 45,
  FUZZY: 25,
  UNKNOWN: 0,
} as const;

export const REPORT_CONFIDENCE_SCORE = {
  VERY_HIGH: 20,
  HIGH: 15,
  MEDIUM: 10,
  LOW: 0,
} as const;

const PRODUCT_MATCH_REASON_FLOORS: Readonly<Record<string, number>> = {
  'Barcode Match': 100,
  'Saved Mapping': 100,
  'Exact Name Match': 80,
  'Fuzzy Name Match': 60,
  'Inactive Product': 60,
};

const CONFLICT_REASON_LABELS: Readonly<Partial<Record<ImportConflictCode, string>>> = {
  [IMPORT_CONFLICT_CODE.UNKNOWN_PRODUCT]: 'Unknown product',
  [IMPORT_CONFLICT_CODE.MULTIPLE_PRODUCTS]: 'Multiple matching products',
  [IMPORT_CONFLICT_CODE.SYSTEM_CONFIGURATION_ERROR]: 'System configuration error',
  [IMPORT_CONFLICT_CODE.MISSING_PRODUCT_NAME]: 'Missing product name',
  [IMPORT_CONFLICT_CODE.MISSING_QUANTITY]: 'Missing quantity',
  [IMPORT_CONFLICT_CODE.ZERO_QUANTITY]: 'Zero quantity',
  [IMPORT_CONFLICT_CODE.NEGATIVE_QUANTITY]: 'Negative quantity',
  [IMPORT_CONFLICT_CODE.INVALID_QUANTITY]: 'Invalid quantity',
  [IMPORT_CONFLICT_CODE.INVALID_AMOUNT]: 'Invalid amount',
  [IMPORT_CONFLICT_CODE.MISSING_SALE_DATE]: 'Missing sale date',
  [IMPORT_CONFLICT_CODE.MISSING_CUSTOMER]: 'Missing customer',
  [IMPORT_CONFLICT_CODE.UNIT_MISMATCH]: 'Unit mismatch',
  [IMPORT_CONFLICT_CODE.DUPLICATE_ROW_IN_FILE]: 'Duplicate row in file',
  [IMPORT_CONFLICT_CODE.NEGATIVE_STOCK_WARNING]: 'Negative stock warning',
  [IMPORT_CONFLICT_CODE.DUPLICATE_IMPORT_WARNING]: 'Duplicate import warning',
  [IMPORT_CONFLICT_CODE.BARCODE_NAME_CONFLICT]: 'Barcode and name conflict',
  [IMPORT_CONFLICT_CODE.INACTIVE_PRODUCT]: 'Inactive product',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function calculateImportConfidence(input: ConfidenceEngineInput): ConfidenceEngineResult {
  if (input.isBlankRow) {
    return buildResult(0, ['Blank row'], input);
  }

  const reasons: string[] = [];
  const productBonus = scoreProductMatching(input.productMatchResult, reasons);
  const reportBonus = scoreReportDetection(input.reportDetectionResult, reasons);
  const penalty = input.conflictEngineResult?.confidencePenalty ?? 0;

  if (penalty > 0) {
    appendConflictReasons(input.conflictEngineResult, reasons);
  }

  let score = clampScore(productBonus + reportBonus - penalty);
  score = applyQualityFloors(score, input);

  return buildResult(score, reasons, input);
}

// ---------------------------------------------------------------------------
// Component scorers
// ---------------------------------------------------------------------------

export function scoreProductMatching(
  match: ProductMatchResult | null | undefined,
  reasons: string[],
): number {
  if (!match) {
    return PRODUCT_MATCH_SCORE.UNKNOWN;
  }

  switch (match.status) {
    case PRODUCT_MATCH_STATUS.NOT_FOUND:
      reasons.push('Product not found');
      return PRODUCT_MATCH_SCORE.UNKNOWN;

    case PRODUCT_MATCH_STATUS.MULTIPLE_MATCHES:
      reasons.push('Multiple products match');
      return PRODUCT_MATCH_SCORE.UNKNOWN;

    case PRODUCT_MATCH_STATUS.SYSTEM_CONFIGURATION_ERROR:
      reasons.push('Catalog configuration error');
      return PRODUCT_MATCH_SCORE.UNKNOWN;

    case PRODUCT_MATCH_STATUS.MATCHED:
      if (match.reason === 'Barcode Match') {
        reasons.push('Barcode matched');
        return PRODUCT_MATCH_SCORE.BARCODE;
      }

      if (match.reason === 'Saved Mapping') {
        reasons.push('Saved mapping reused');
        return PRODUCT_MATCH_SCORE.SAVED_MAPPING;
      }

      reasons.push('Exact product name match');
      return PRODUCT_MATCH_SCORE.EXACT_NAME;

    case PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION:
      if (match.reason === 'Inactive Product') {
        reasons.push('Inactive product matched');
        return PRODUCT_MATCH_SCORE.EXACT_NAME;
      }

      reasons.push('Fuzzy product name match');
      return PRODUCT_MATCH_SCORE.FUZZY;

    default:
      return PRODUCT_MATCH_SCORE.UNKNOWN;
  }
}

export function scoreReportDetection(
  report: ReportDetectionResult | null | undefined,
  reasons: string[],
): number {
  if (!report) {
    return REPORT_CONFIDENCE_SCORE.LOW;
  }

  if (report.reportType === 'unknown') {
    reasons.push('Unknown report structure');
    return REPORT_CONFIDENCE_SCORE.LOW;
  }

  const reportPercent = normalizeReportConfidencePercent(report.confidence);

  if (reportPercent >= 90) {
    reasons.push('Report detected confidently');
    return REPORT_CONFIDENCE_SCORE.VERY_HIGH;
  }

  if (reportPercent >= 80) {
    reasons.push('Report detected with high confidence');
    return REPORT_CONFIDENCE_SCORE.HIGH;
  }

  if (reportPercent >= 60) {
    reasons.push('Report detected with moderate confidence');
    return REPORT_CONFIDENCE_SCORE.MEDIUM;
  }

  reasons.push('Low report detection confidence');
  return REPORT_CONFIDENCE_SCORE.LOW;
}

export function normalizeReportConfidencePercent(confidence: number): number {
  if (confidence <= 1) {
    return confidence * 100;
  }

  return confidence;
}

// ---------------------------------------------------------------------------
// Level & recommendation
// ---------------------------------------------------------------------------

export function resolveConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 95) {
    return CONFIDENCE_LEVEL.VERY_HIGH;
  }

  if (score >= 80) {
    return CONFIDENCE_LEVEL.HIGH;
  }

  if (score >= 60) {
    return CONFIDENCE_LEVEL.MEDIUM;
  }

  if (score >= 40) {
    return CONFIDENCE_LEVEL.LOW;
  }

  return CONFIDENCE_LEVEL.VERY_LOW;
}

export function resolveAutoImportRecommendation(
  score: number,
  input: ConfidenceEngineInput,
): AutoImportRecommendation {
  const conflict = input.conflictEngineResult;

  if (input.isBlankRow) {
    return AUTO_IMPORT_RECOMMENDATION.BLOCK_IMPORT;
  }

  if (conflict?.status === CONFLICT_ENGINE_STATUS.ERROR) {
    return AUTO_IMPORT_RECOMMENDATION.BLOCK_IMPORT;
  }

  const level = resolveConfidenceLevel(score);

  switch (level) {
    case CONFIDENCE_LEVEL.VERY_HIGH:
      return AUTO_IMPORT_RECOMMENDATION.AUTO_IMPORT;
    case CONFIDENCE_LEVEL.HIGH:
      return AUTO_IMPORT_RECOMMENDATION.PREVIEW_FIRST;
    case CONFIDENCE_LEVEL.MEDIUM:
    case CONFIDENCE_LEVEL.LOW:
      return AUTO_IMPORT_RECOMMENDATION.USER_CONFIRMATION;
    default:
      return AUTO_IMPORT_RECOMMENDATION.BLOCK_IMPORT;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applyQualityFloors(score: number, input: ConfidenceEngineInput): number {
  const conflict = input.conflictEngineResult;

  if (conflict?.status === CONFLICT_ENGINE_STATUS.ERROR) {
    return score;
  }

  if (conflict?.status === CONFLICT_ENGINE_STATUS.WARNING) {
    return clampScore(Math.max(score, 60));
  }

  const matchReason = input.productMatchResult?.reason;
  const productFloor = matchReason ? PRODUCT_MATCH_REASON_FLOORS[matchReason] : undefined;

  return clampScore(productFloor != null ? Math.max(score, productFloor) : score);
}

function appendConflictReasons(
  conflict: ConflictEngineResult | null | undefined,
  reasons: string[],
): void {
  if (!conflict) {
    return;
  }

  for (const entry of [...conflict.conflicts, ...conflict.warnings]) {
    appendConflictReason(entry, reasons);
  }
}

function appendConflictReason(entry: ImportConflictEntry, reasons: string[]): void {
  const label = CONFLICT_REASON_LABELS[entry.code];

  if (label && !reasons.includes(label)) {
    reasons.push(label);
  }
}

function buildResult(
  score: number,
  reasons: string[],
  input: ConfidenceEngineInput,
): ConfidenceEngineResult {
  const confidenceScore = clampScore(score);
  const uniqueReasons = [...new Set(reasons)];

  return {
    confidenceScore,
    confidenceLevel: resolveConfidenceLevel(confidenceScore),
    confidenceReasons: uniqueReasons,
    autoImportRecommendation: resolveAutoImportRecommendation(confidenceScore, input),
  };
}

function clampScore(value: number): number {
  if (value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return Math.round(value);
}
