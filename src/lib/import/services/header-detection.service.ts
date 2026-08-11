/**
 * Header Detection — picks the most likely header row from a raw worksheet
 * matrix using only entity ColumnDefinition aliases (field, label, synonyms).
 *
 * Completely generic: no vendor names, no report-type heuristics, no
 * Bakery-specific rules. Works for any EntityImportDefinition.
 *
 * Pure: no I/O, no Firestore, no React.
 */

import { buildHeaders, isEmptyRow } from '@/lib/import/engine/parser';
import type { ColumnDefinition, RawCellValue } from '@/lib/import/engine/types';
import { mergeUniversalAliasesIntoIndex } from '@/lib/import/services/header-alias-dictionary';

/** How many leading matrix rows to consider as header candidates. */
export const HEADER_SCAN_ROW_LIMIT = 30;

const ALIAS_MATCH_WEIGHT = 10;
const REQUIRED_FIELD_WEIGHT = 20;
const HEADER_DENSITY_WEIGHT = 5;
const DUPLICATE_HEADER_PENALTY = 4;
const EMPTY_CELL_PENALTY = 0.5;

export type HeaderScoreBreakdown = {
  /** Distinct target fields matched via field / label / synonym. */
  aliasMatches: number;
  /** How many of those matches are required fields. */
  requiredFieldMatches: number;
  /** Non-empty cells / row width, in [0, 1]. */
  headerDensity: number;
  /** Count of duplicate normalized labels among non-empty cells. */
  duplicateHeaderCount: number;
  /** Count of empty / blank cells in the candidate row. */
  emptyCellCount: number;
  /** Weighted total used for ranking. */
  totalScore: number;
};

export type HeaderDetectionResult = {
  /** 0-based index into the worksheet matrix. */
  headerRowIndex: number;
  /** Display headers (de-duplicated), ready for auto-mapping / ParsedFile. */
  detectedHeaders: string[];
  /** Confidence in [0, 1]. Low when few or no alias matches. */
  confidence: number;
  scoreBreakdown: HeaderScoreBreakdown;
  /** Human-readable explanation of why this row won. */
  reasoning: string[];
};

export type DetectHeaderRowOptions = {
  /** Override the leading-row scan window. Defaults to HEADER_SCAN_ROW_LIMIT. */
  scanRowLimit?: number;
};

/**
 * Scores the first N rows of a matrix and returns the highest-confidence
 * header candidate. Empty rows are skipped (not scored).
 *
 * When no non-empty row exists in the scan window, returns a zero-confidence
 * result with `headerRowIndex: -1` and empty headers — callers decide whether
 * to treat that as a hard failure.
 */
export function detectHeaderRow(
  matrix: readonly (readonly RawCellValue[])[],
  columns: readonly ColumnDefinition[],
  options: DetectHeaderRowOptions = {},
): HeaderDetectionResult {
  const scanRowLimit = options.scanRowLimit ?? HEADER_SCAN_ROW_LIMIT;
  const aliasIndex = buildAliasIndex(columns);
  const requiredFields = new Set(columns.filter((column) => column.required).map((c) => c.field));
  const maxAliasableFields = Math.max(columns.length, 1);
  const maxRequiredFields = Math.max(requiredFields.size, 1);

  let best: ScoredCandidate | null = null;

  const limit = Math.min(matrix.length, scanRowLimit);

  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const row = matrix[rowIndex] ?? [];

    if (isEmptyRow(row)) {
      continue;
    }

    const scored = scoreRow(row, rowIndex, aliasIndex, requiredFields);

    if (!best || compareCandidates(scored, best) > 0) {
      best = scored;
    }
  }

  if (!best) {
    return {
      headerRowIndex: -1,
      detectedHeaders: [],
      confidence: 0,
      scoreBreakdown: {
        aliasMatches: 0,
        requiredFieldMatches: 0,
        headerDensity: 0,
        duplicateHeaderCount: 0,
        emptyCellCount: 0,
        totalScore: 0,
      },
      reasoning: [
        `No non-empty rows found in the first ${scanRowLimit} rows.`,
        'Cannot detect a header row.',
      ],
    };
  }

  const confidence = computeConfidence(best.breakdown, maxAliasableFields, maxRequiredFields);
  const detectedHeaders = buildHeaders(best.row);
  const reasoning = buildReasoning(best, confidence, scanRowLimit);

  return {
    headerRowIndex: best.rowIndex,
    detectedHeaders,
    confidence,
    scoreBreakdown: best.breakdown,
    reasoning,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type AliasIndex = Map<string, { field: string; required: boolean }>;

type ScoredCandidate = {
  rowIndex: number;
  row: readonly RawCellValue[];
  breakdown: HeaderScoreBreakdown;
  matchedFields: readonly string[];
};

/**
 * Normalize a header cell for alias comparison:
 * trim, lowercase, collapse whitespace, strip bracketed suffixes,
 * normalize underscores/dots/punctuation.
 */
export function normalizeHeaderLabel(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[[({][^)\]}]*[\])}]/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildAliasIndex(columns: readonly ColumnDefinition[]): AliasIndex {
  const index: AliasIndex = new Map();

  for (const column of columns) {
    const candidates = [column.field, column.label, ...(column.synonyms ?? [])];

    for (const candidate of candidates) {
      const key = normalizeHeaderLabel(candidate);

      if (key && !index.has(key)) {
        index.set(key, { field: column.field, required: column.required });
      }
    }
  }

  mergeUniversalAliasesIntoIndex(index, columns, normalizeHeaderLabel);

  return index;
}

function cellText(cell: RawCellValue): string | null {
  if (cell === null) {
    return null;
  }

  if (typeof cell === 'string') {
    const trimmed = cell.trim();
    return trimmed === '' ? null : trimmed;
  }

  if (typeof cell === 'number' || typeof cell === 'boolean') {
    return String(cell);
  }

  if (cell instanceof Date) {
    return cell.toISOString();
  }

  return null;
}

function scoreRow(
  row: readonly RawCellValue[],
  rowIndex: number,
  aliasIndex: AliasIndex,
  requiredFields: ReadonlySet<string>,
): ScoredCandidate {
  const width = Math.max(row.length, 1);
  const matchedFields = new Set<string>();
  const seenLabels = new Map<string, number>();
  let emptyCellCount = 0;
  let nonEmptyCount = 0;

  for (const cell of row) {
    const text = cellText(cell);

    if (text === null) {
      emptyCellCount += 1;
      continue;
    }

    nonEmptyCount += 1;
    const normalized = normalizeHeaderLabel(text);
    seenLabels.set(normalized, (seenLabels.get(normalized) ?? 0) + 1);

    const match = aliasIndex.get(normalized);

    if (match) {
      matchedFields.add(match.field);
    }
  }

  let duplicateHeaderCount = 0;

  for (const count of seenLabels.values()) {
    if (count > 1) {
      duplicateHeaderCount += count - 1;
    }
  }

  const aliasMatches = matchedFields.size;
  let requiredFieldMatches = 0;

  for (const field of matchedFields) {
    if (requiredFields.has(field)) {
      requiredFieldMatches += 1;
    }
  }

  const headerDensity = nonEmptyCount / width;

  const totalScore =
    aliasMatches * ALIAS_MATCH_WEIGHT +
    requiredFieldMatches * REQUIRED_FIELD_WEIGHT +
    headerDensity * HEADER_DENSITY_WEIGHT -
    duplicateHeaderCount * DUPLICATE_HEADER_PENALTY -
    emptyCellCount * EMPTY_CELL_PENALTY;

  return {
    rowIndex,
    row,
    matchedFields: [...matchedFields],
    breakdown: {
      aliasMatches,
      requiredFieldMatches,
      headerDensity,
      duplicateHeaderCount,
      emptyCellCount,
      totalScore,
    },
  };
}

/** Positive when `a` should rank above `b`. */
function compareCandidates(a: ScoredCandidate, b: ScoredCandidate): number {
  if (a.breakdown.totalScore !== b.breakdown.totalScore) {
    return a.breakdown.totalScore - b.breakdown.totalScore;
  }

  // Tie-break: more alias matches, then earlier row (stable / backward-friendly).
  if (a.breakdown.aliasMatches !== b.breakdown.aliasMatches) {
    return a.breakdown.aliasMatches - b.breakdown.aliasMatches;
  }

  return b.rowIndex - a.rowIndex;
}

function computeConfidence(
  breakdown: HeaderScoreBreakdown,
  maxAliasableFields: number,
  maxRequiredFields: number,
): number {
  if (breakdown.aliasMatches === 0) {
    // Density alone never implies a real header — keep confidence low.
    return Math.min(0.25, breakdown.headerDensity * 0.2);
  }

  const aliasRatio = breakdown.aliasMatches / maxAliasableFields;
  const requiredRatio = breakdown.requiredFieldMatches / maxRequiredFields;
  const duplicateDrag = Math.min(0.2, breakdown.duplicateHeaderCount * 0.05);

  const raw =
    aliasRatio * 0.55 +
    requiredRatio * 0.3 +
    breakdown.headerDensity * 0.15 -
    duplicateDrag;

  return clamp01(raw);
}

function buildReasoning(
  best: ScoredCandidate,
  confidence: number,
  scanRowLimit: number,
): string[] {
  const { breakdown, rowIndex, matchedFields } = best;
  const reasoning: string[] = [
    `Scanned the first ${scanRowLimit} rows and selected matrix row ${rowIndex} (0-based).`,
    `Matched ${breakdown.aliasMatches} distinct field alias(es)` +
      (matchedFields.length > 0 ? `: ${matchedFields.join(', ')}.` : '.'),
  ];

  if (breakdown.requiredFieldMatches > 0) {
    reasoning.push(`Matched ${breakdown.requiredFieldMatches} required field(s).`);
  }

  reasoning.push(
    `Header density ${(breakdown.headerDensity * 100).toFixed(0)}%` +
      ` (${breakdown.emptyCellCount} empty cell(s)` +
      `, ${breakdown.duplicateHeaderCount} duplicate label(s)).`,
  );

  reasoning.push(`Confidence ${confidence.toFixed(2)} (score ${breakdown.totalScore.toFixed(2)}).`);

  if (confidence < 0.4) {
    reasoning.push(
      'Low confidence: few or no column aliases matched. The file may not be a recognized import layout.',
    );
  }

  return reasoning;
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
