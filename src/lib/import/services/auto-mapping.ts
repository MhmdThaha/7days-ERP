/**
 * Profile-aware Auto Mapping.
 *
 * Builds a MappingConfig from detected headers using:
 *   - Entity Import Definition aliases (field / label / synonyms)
 *   - Report Definition / Profile mappingHints
 *
 * Generic and deterministic: never branches on report ids or vendor names.
 * Equal top scores become ambiguousMappings instead of arbitrary picks.
 * Adding a new report = change the Report Definition only.
 */

import type { ColumnDefinition, MappingConfig } from '@/lib/import/engine/types';
import type { ReportDefinition, ReportMappingHints } from '@/lib/import/reports/types';
import { normalizeHeaderLabel } from '@/lib/import/services/header-detection.service';

export type FieldMatchCandidate = {
  targetField: string;
  score: number;
};

export type MappedField = {
  sourceHeader: string;
  targetField: string;
  score: number;
};

export type AmbiguousMapping = {
  sourceHeader: string;
  candidates: readonly FieldMatchCandidate[];
};

export type AutoMappingResult = {
  /** Engine-ready mapping (non-ambiguous claims only). */
  mapping: MappingConfig;
  /** Successful header → field claims. */
  mappedFields: readonly MappedField[];
  /** Headers with no usable candidate (after ignores). */
  unmappedHeaders: readonly string[];
  /** Headers that only matched ignored fields (or were skipped via hints). */
  ignoredHeaders: readonly string[];
  /** Headers with two+ equal top-scoring candidates — not auto-resolved. */
  ambiguousMappings: readonly AmbiguousMapping[];
  /** Overall confidence in [0, 1]. */
  mappingConfidence: number;
  /** Human-readable explanation of how the mapping was produced. */
  explanation: string[];
};

export type BuildAutoMappingOptions = {
  /**
   * Report Definition / Profile from Report Detection.
   * When omitted, mapping uses entity aliases only (empty hints).
   */
  profile?: ReportDefinition | null;
};

const SCORE_FIELD_KEY = 100;
const SCORE_LABEL = 90;
const SCORE_SYNONYM = 80;
const SCORE_SYNONYM_BOOST = 95;
const PREFERRED_ORDER_STEP = 0.01;
const REQUIRED_PRIORITY_STEP = 0.1;
const REQUIRED_PRIORITY_BASE = 1;
const ENTITY_REQUIRED_BONUS = 0.5;

/**
 * Maps detected headers onto entity columns, optionally guided by a Report
 * Profile's mappingHints.
 */
export function buildAutoMapping(
  headers: readonly string[],
  columns: readonly ColumnDefinition[],
  options: BuildAutoMappingOptions | ReportDefinition | null = {},
): AutoMappingResult {
  const profile = resolveProfile(options);
  const hints: ReportMappingHints = profile?.mappingHints ?? {};
  const ignoreFields = new Set(hints.ignoreFields ?? []);
  const columnsByField = new Map(columns.map((column) => [column.field, column]));

  const boostIndex = buildBoostIndex(hints.synonymBoosts);
  const explanation: string[] = [
    profile
      ? `Auto-mapping with profile "${profile.displayName}" (${profile.id}).`
      : 'Auto-mapping with entity aliases only (no report profile).',
  ];

  if (ignoreFields.size > 0) {
    explanation.push(`Ignoring target fields: ${[...ignoreFields].join(', ')}.`);
  }

  const mappedFields: MappedField[] = [];
  const unmappedHeaders: string[] = [];
  const ignoredHeaders: string[] = [];
  const ambiguousMappings: AmbiguousMapping[] = [];
  const claimedFields = new Set<string>();

  // Deterministic: process headers in file order.
  for (const header of headers) {
    const allMatches = scoreHeaderAgainstColumns(header, columns, hints, boostIndex);

    const ignoredOnly = allMatches.filter((match) => ignoreFields.has(match.targetField));
    const usable = allMatches.filter((match) => !ignoreFields.has(match.targetField));

    if (usable.length === 0) {
      if (ignoredOnly.length > 0) {
        ignoredHeaders.push(header);
      } else {
        unmappedHeaders.push(header);
      }
      continue;
    }

    const available = usable.filter((match) => !claimedFields.has(match.targetField));

    if (available.length === 0) {
      // All matching fields already claimed by an earlier header.
      unmappedHeaders.push(header);
      continue;
    }

    const topScore = Math.max(...available.map((match) => match.score));
    const top = available
      .filter((match) => almostEqual(match.score, topScore))
      .sort((a, b) => a.targetField.localeCompare(b.targetField));

    if (top.length > 1) {
      ambiguousMappings.push({
        sourceHeader: header,
        candidates: top.map((candidate) => ({
          targetField: candidate.targetField,
          score: roundScore(candidate.score),
        })),
      });
      continue;
    }

    const winner = top[0];
    if (!winner) {
      unmappedHeaders.push(header);
      continue;
    }

    claimedFields.add(winner.targetField);
    mappedFields.push({
      sourceHeader: header,
      targetField: winner.targetField,
      score: roundScore(winner.score),
    });
  }

  const mappingConfidence = computeMappingConfidence({
    headerCount: headers.length,
    mappedCount: mappedFields.length,
    ambiguousCount: ambiguousMappings.length,
    ignoredCount: ignoredHeaders.length,
    profile,
    mappedFields,
    columnsByField,
  });

  explanation.push(
    `Mapped ${mappedFields.length} header(s); ${unmappedHeaders.length} unmapped; ` +
      `${ignoredHeaders.length} ignored; ${ambiguousMappings.length} ambiguous.`,
  );
  explanation.push(`Mapping confidence ${mappingConfidence.toFixed(2)}.`);

  if (ambiguousMappings.length > 0) {
    explanation.push(
      'Ambiguous headers were left unresolved (equal top scores) for deterministic review.',
    );
  }

  return {
    mapping: {
      columnMappings: mappedFields.map((field) => ({
        sourceHeader: field.sourceHeader,
        targetField: field.targetField,
      })),
    },
    mappedFields,
    unmappedHeaders,
    ignoredHeaders,
    ambiguousMappings,
    mappingConfidence,
    explanation,
  };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function resolveProfile(
  options: BuildAutoMappingOptions | ReportDefinition | null | undefined,
): ReportDefinition | null {
  if (!options) {
    return null;
  }

  // Full Report Definition passed directly (legacy/convenient call shape).
  if ('reportType' in options && 'mappingHints' in options && 'id' in options) {
    return options as ReportDefinition;
  }

  return (options as BuildAutoMappingOptions).profile ?? null;
}

function scoreHeaderAgainstColumns(
  header: string,
  columns: readonly ColumnDefinition[],
  hints: ReportMappingHints,
  boostIndex: Map<string, string>,
): FieldMatchCandidate[] {
  const normalizedHeader = normalizeHeaderLabel(header);
  const matches: FieldMatchCandidate[] = [];

  for (const column of columns) {
    const score = scoreHeaderForField(header, normalizedHeader, column, hints, boostIndex);

    if (score !== null) {
      matches.push({ targetField: column.field, score });
    }
  }

  return matches;
}

function scoreHeaderForField(
  header: string,
  normalizedHeader: string,
  column: ColumnDefinition,
  hints: ReportMappingHints,
  boostIndex: Map<string, string>,
): number | null {
  let base: number | null = null;

  if (normalizeHeaderLabel(column.field) === normalizedHeader) {
    base = SCORE_FIELD_KEY;
  } else if (normalizeHeaderLabel(column.label) === normalizedHeader) {
    base = SCORE_LABEL;
  } else if (
    (column.synonyms ?? []).some((synonym) => normalizeHeaderLabel(synonym) === normalizedHeader)
  ) {
    base = SCORE_SYNONYM;
  }

  const boostedField = boostIndex.get(normalizedHeader);
  if (boostedField === column.field) {
    base = Math.max(base ?? 0, SCORE_SYNONYM_BOOST);
  }

  // Also allow exact (pre-normalize) keys in synonymBoosts for author convenience.
  const rawBoost = hints.synonymBoosts?.[header];
  if (rawBoost === column.field) {
    base = Math.max(base ?? 0, SCORE_SYNONYM_BOOST);
  }

  if (base === null) {
    return null;
  }

  let score = base;

  const preferred = hints.preferredFieldOrder ?? [];
  const preferredIndex = preferred.indexOf(column.field);
  if (preferredIndex >= 0) {
    score += (preferred.length - preferredIndex) * PREFERRED_ORDER_STEP;
  }

  const requiredPriority = hints.requiredFieldPriority ?? [];
  const requiredIndex = requiredPriority.indexOf(column.field);
  if (requiredIndex >= 0) {
    score += REQUIRED_PRIORITY_BASE + (requiredPriority.length - requiredIndex) * REQUIRED_PRIORITY_STEP;
  } else if (column.required) {
    score += ENTITY_REQUIRED_BONUS;
  }

  return score;
}

function buildBoostIndex(
  synonymBoosts: ReportMappingHints['synonymBoosts'],
): Map<string, string> {
  const index = new Map<string, string>();

  if (!synonymBoosts) {
    return index;
  }

  for (const [alias, field] of Object.entries(synonymBoosts)) {
    const key = normalizeHeaderLabel(alias);
    if (!index.has(key)) {
      index.set(key, field);
    }
  }

  return index;
}

function computeMappingConfidence(input: {
  headerCount: number;
  mappedCount: number;
  ambiguousCount: number;
  ignoredCount: number;
  profile: ReportDefinition | null;
  mappedFields: readonly MappedField[];
  columnsByField: Map<string, ColumnDefinition>;
}): number {
  const { headerCount, mappedCount, ambiguousCount, ignoredCount, profile, mappedFields, columnsByField } =
    input;

  if (headerCount === 0) {
    return 0;
  }

  const coverage = mappedCount / headerCount;
  const ambiguityPenalty = ambiguousCount / headerCount;
  const ignoreRatio = ignoredCount / headerCount;

  // Ignored headers are intentional for the profile — mild penalty only.
  let confidence = coverage * 0.75 + (1 - ambiguityPenalty) * 0.2 + (1 - ignoreRatio) * 0.05;

  const requiredPriority = profile?.mappingHints.requiredFieldPriority ?? [];
  if (requiredPriority.length > 0) {
    const mappedSet = new Set(mappedFields.map((field) => field.targetField));
    const hit = requiredPriority.filter((field) => mappedSet.has(field)).length;
    confidence = confidence * 0.85 + (hit / requiredPriority.length) * 0.15;
  } else {
    const requiredColumns = [...columnsByField.values()].filter((column) => column.required);
    if (requiredColumns.length > 0) {
      const mappedSet = new Set(mappedFields.map((field) => field.targetField));
      const hit = requiredColumns.filter((column) => mappedSet.has(column.field)).length;
      confidence = confidence * 0.85 + (hit / requiredColumns.length) * 0.15;
    }
  }

  if (!profile || profile.reportType === 'unknown') {
    confidence = Math.min(confidence, 0.35);
  }

  return clamp01(roundScore(confidence));
}

function almostEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
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
