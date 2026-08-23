/**
 * Duplicate candidate lookup via index with org coverage gating and safe full-history fallback.
 *
 * The index answers: "Which imports should we inspect?"
 * detectDuplicateImport() answers: "Is this actually a duplicate?"
 */

import 'server-only';

import type {
  DetectDuplicateImportInput,
  DuplicateImportFingerprints,
  DuplicateImportResult,
  ImportHistoryRecord,
} from '@/lib/import/duplicate/duplicate-import.types';
import {
  buildDuplicateImportFingerprints,
  detectDuplicateImport,
} from '@/lib/import/duplicate/duplicate-import.service';
import { ORG_IMPORT_INDEX_COVERAGE } from '@/lib/import/duplicate/import-index-health.types';
import {
  lookupCandidateImportIdsFromIndexBatched,
} from '@/lib/import/duplicate/import-duplicate-index-lookup.service';
import { lookupPrimaryFileLockImportId } from '@/lib/import/duplicate/import-index-verification';
import type { ImportReviewViewModelWithResolution } from '@/lib/import/resolution/types';
import { importHistoryRepository } from '@/lib/repositories/import-history.repository';
import { importIndexHealthRepository } from '@/lib/repositories/import-index-health.repository';

export type DuplicateCandidateLookupSource =
  | 'index'
  | 'index-empty'
  | 'fallback-empty-index'
  | 'fallback-error'
  | 'fallback-incomplete'
  | 'fallback-repairing'
  | 'fallback-unknown';

export type DuplicateCandidateLookupMeta = {
  source: DuplicateCandidateLookupSource;
  candidateImportIds: readonly string[];
  importHistoryCount: number;
  indexLookupCount: number;
  orgCoverage: typeof ORG_IMPORT_INDEX_COVERAGE[keyof typeof ORG_IMPORT_INDEX_COVERAGE] | 'missing';
};

export type DuplicateDetectionViaIndexResult = {
  result: DuplicateImportResult;
  candidateImportIds: readonly string[];
  candidateHistoryCount: number;
  fullHistoryCount: number;
  meta: DuplicateCandidateLookupMeta;
};

export type DuplicateDetectionParityResult = {
  oldResult: DuplicateImportResult;
  newResult: DuplicateImportResult;
  candidateImportIds: readonly string[];
  fullHistoryCount: number;
  candidateHistoryCount: number;
  matches: boolean;
  meta: DuplicateCandidateLookupMeta;
};

type ResolvedImportHistory = {
  importHistory: ImportHistoryRecord[];
  meta: DuplicateCandidateLookupMeta;
};

function buildMeta(
  source: DuplicateCandidateLookupSource,
  candidateIds: ReadonlySet<string>,
  importHistoryCount: number,
  indexLookupCount: number,
  orgCoverage: DuplicateCandidateLookupMeta['orgCoverage'],
): DuplicateCandidateLookupMeta {
  return {
    source,
    candidateImportIds: [...candidateIds].sort(),
    importHistoryCount,
    indexLookupCount,
    orgCoverage,
  };
}

/** Collect distinct importIds referenced by invoice and row index hits. */
export async function lookupCandidateImportIdsFromIndex(
  orgId: string,
  fingerprints: DuplicateImportFingerprints,
): Promise<{ candidateIds: Set<string>; indexLookupCount: number }> {
  return lookupCandidateImportIdsFromIndexBatched(orgId, fingerprints);
}

async function loadImportHistoryByIds(
  orgId: string,
  importIds: ReadonlySet<string>,
): Promise<ImportHistoryRecord[]> {
  const records: ImportHistoryRecord[] = [];

  for (const importId of importIds) {
    const detail = await importHistoryRepository.getById(orgId, importId);

    if (detail && detail.duplicateMetadataComplete !== false) {
      records.push(detail);
    }
  }

  records.sort((a, b) => b.importedAt.localeCompare(a.importedAt));

  return records;
}

function filterCompleteDuplicateMetadata(
  importHistory: readonly ImportHistoryRecord[],
): ImportHistoryRecord[] {
  return importHistory.filter((record) => record.duplicateMetadataComplete !== false);
}

function fallbackSourceFromCoverage(
  _coverage: DuplicateCandidateLookupMeta['orgCoverage'],
): DuplicateCandidateLookupSource {
  if (_coverage === ORG_IMPORT_INDEX_COVERAGE.REPAIRING) {
    return 'fallback-repairing';
  }

  return 'fallback-incomplete';
}

async function resolveSafeFallbackHistory(
  orgId: string,
  orgCoverage: DuplicateCandidateLookupMeta['orgCoverage'],
  candidateIds: ReadonlySet<string>,
  indexLookupCount: number,
): Promise<ResolvedImportHistory> {
  const hasHistory = await importHistoryRepository.hasAny(orgId);

  if (!hasHistory) {
    return {
      importHistory: [],
      meta: buildMeta('fallback-empty-index', candidateIds, 0, indexLookupCount, orgCoverage),
    };
  }

  const importHistory = filterCompleteDuplicateMetadata(await importHistoryRepository.list(orgId));

  return {
    importHistory,
    meta: buildMeta(
      fallbackSourceFromCoverage(orgCoverage),
      candidateIds,
      importHistory.length,
      indexLookupCount,
      orgCoverage,
    ),
  };
}

/**
 * Resolve import history for duplicate detection.
 *
 * Fast path (candidate-only load) only when organization index coverage is verified complete.
 * Otherwise uses full-history fallback so partial index cannot produce false NO_DUPLICATE.
 */
export async function resolveImportHistoryForDuplicateDetection(
  orgId: string,
  resolvedReview: ImportReviewViewModelWithResolution,
): Promise<ResolvedImportHistory> {
  const orgMeta = await importIndexHealthRepository.getOrgCoverage(orgId);
  const orgCoverage = orgMeta?.coverage ?? 'missing';
  const useFastPath = importIndexHealthRepository.isCoverageComplete(orgMeta);
  const hasIncompleteDuplicateMetadata =
    await importHistoryRepository.hasIncompleteDuplicateMetadata(orgId);
  const mustUseFullHistoryFallback = !useFastPath || hasIncompleteDuplicateMetadata;

  if (mustUseFullHistoryFallback) {
    return resolveSafeFallbackHistory(orgId, orgCoverage, new Set(), 0);
  }

  const fingerprints = buildDuplicateImportFingerprints(resolvedReview.rows);

  try {
    const { candidateIds, indexLookupCount } = await lookupCandidateImportIdsFromIndex(
      orgId,
      fingerprints,
    );

    const fileLockImportId = await lookupPrimaryFileLockImportId(orgId, fingerprints.fileFingerprint);

    if (fileLockImportId) {
      candidateIds.add(fileLockImportId);
    }

    if (candidateIds.size === 0) {
      const hasHistory = await importHistoryRepository.hasAny(orgId);

      return {
        importHistory: [],
        meta: buildMeta('index-empty', candidateIds, 0, indexLookupCount, orgCoverage),
      };
    }

    const importHistory = await loadImportHistoryByIds(orgId, candidateIds);

    return {
      importHistory,
      meta: buildMeta('index', candidateIds, importHistory.length, indexLookupCount, orgCoverage),
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[import-duplicate-candidate] index lookup failed; falling back to full history', {
        orgId,
        error,
      });
    }

    const importHistory = filterCompleteDuplicateMetadata(await importHistoryRepository.list(orgId));

    return {
      importHistory,
      meta: buildMeta('fallback-error', new Set(), importHistory.length, 0, orgCoverage),
    };
  }
}

/** Production duplicate detection: index candidates with safe fallback. */
export async function detectDuplicateImportWithCandidateLookup(
  orgId: string,
  resolvedReview: ImportReviewViewModelWithResolution,
): Promise<DuplicateImportResult> {
  const { importHistory } = await resolveImportHistoryForDuplicateDetection(orgId, resolvedReview);

  return detectDuplicateImport({
    resolvedReview,
    importHistory,
  });
}

/** Index lookup → candidate history → unchanged duplicate algorithm (no fallback). */
export async function detectDuplicateImportViaIndex(
  orgId: string,
  input: DetectDuplicateImportInput,
): Promise<DuplicateDetectionViaIndexResult> {
  const fingerprints = buildDuplicateImportFingerprints(input.resolvedReview.rows);
  const { candidateIds, indexLookupCount } = await lookupCandidateImportIdsFromIndex(
    orgId,
    fingerprints,
  );
  const fileLockImportId = await lookupPrimaryFileLockImportId(orgId, fingerprints.fileFingerprint);

  if (fileLockImportId) {
    candidateIds.add(fileLockImportId);
  }

  const candidateHistory = await loadImportHistoryByIds(orgId, candidateIds);
  const result = detectDuplicateImport({
    resolvedReview: input.resolvedReview,
    importHistory: candidateHistory,
  });

  return {
    result,
    candidateImportIds: [...candidateIds].sort(),
    candidateHistoryCount: candidateHistory.length,
    fullHistoryCount: input.importHistory.length,
    meta: buildMeta(
      candidateIds.size > 0 ? 'index' : 'index-empty',
      candidateIds,
      candidateHistory.length,
      indexLookupCount,
      'missing',
    ),
  };
}

export function areDuplicateResultsEqual(
  left: DuplicateImportResult,
  right: DuplicateImportResult,
): boolean {
  return (
    left.status === right.status &&
    left.confidence === right.confidence &&
    left.recommendation === right.recommendation &&
    left.matchedImport?.importId === right.matchedImport?.importId &&
    left.matchedRows === right.matchedRows &&
    [...left.matchedInvoices].sort().join('\u001f') ===
      [...right.matchedInvoices].sort().join('\u001f') &&
    [...left.duplicateRowFingerprints].sort().join('\u001f') ===
      [...right.duplicateRowFingerprints].sort().join('\u001f')
  );
}

/** Compare authoritative full-history path vs production index candidate path. */
export async function compareDuplicateDetectionPaths(
  orgId: string,
  input: DetectDuplicateImportInput,
): Promise<DuplicateDetectionParityResult> {
  const oldResult = detectDuplicateImport(input);
  const { importHistory, meta } = await resolveImportHistoryForDuplicateDetection(
    orgId,
    input.resolvedReview,
  );
  const newResult = detectDuplicateImport({
    resolvedReview: input.resolvedReview,
    importHistory,
  });

  return {
    oldResult,
    newResult,
    candidateImportIds: meta.candidateImportIds,
    fullHistoryCount: input.importHistory.length,
    candidateHistoryCount: importHistory.length,
    matches: areDuplicateResultsEqual(oldResult, newResult),
    meta,
  };
}

export async function lookupCandidateImportIdsForDuplicateDetection(
  orgId: string,
  resolvedReview: ImportReviewViewModelWithResolution,
): Promise<{ candidateIds: Set<string>; indexLookupCount: number }> {
  const fingerprints = buildDuplicateImportFingerprints(resolvedReview.rows);
  const { candidateIds, indexLookupCount } = await lookupCandidateImportIdsFromIndex(
    orgId,
    fingerprints,
  );
  const fileLockImportId = await lookupPrimaryFileLockImportId(orgId, fingerprints.fileFingerprint);

  if (fileLockImportId) {
    candidateIds.add(fileLockImportId);
  }

  return { candidateIds, indexLookupCount };
}
