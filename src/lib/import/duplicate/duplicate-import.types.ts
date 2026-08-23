/**
 * Duplicate Import Protection types — pure analysis against prior import history.
 */

import type { ImportReviewViewModelWithResolution } from '@/lib/import/resolution/types';
import type { ImportDuplicateIndexStatus } from '@/lib/import/duplicate/import-index-health.types';
import type { DuplicateMetadataStorage } from '@/lib/import/duplicate/import-history-duplicate-metadata.types';

export const DUPLICATE_IMPORT_STATUS = {
  NO_DUPLICATE: 'NO_DUPLICATE',
  POSSIBLE_DUPLICATE: 'POSSIBLE_DUPLICATE',
  HIGH_CONFIDENCE_DUPLICATE: 'HIGH_CONFIDENCE_DUPLICATE',
  EXACT_DUPLICATE: 'EXACT_DUPLICATE',
} as const;

export type DuplicateImportStatus =
  (typeof DUPLICATE_IMPORT_STATUS)[keyof typeof DUPLICATE_IMPORT_STATUS];

export const DUPLICATE_IMPORT_RECOMMENDATION = {
  CONTINUE: 'CONTINUE',
  REVIEW: 'REVIEW',
  SKIP_DUPLICATES: 'SKIP_DUPLICATES',
  BLOCK_IMPORT: 'BLOCK_IMPORT',
} as const;

export type DuplicateImportRecommendation =
  (typeof DUPLICATE_IMPORT_RECOMMENDATION)[keyof typeof DUPLICATE_IMPORT_RECOMMENDATION];

export const IMPORT_HISTORY_STATUS = {
  IMPORTING: 'IMPORTING',
  IMPORTED: 'IMPORTED',
  FINALIZING: 'FINALIZING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  ROLLED_BACK: 'ROLLED_BACK',
  CANCELLED: 'CANCELLED',
} as const;

export type ImportHistoryStatus =
  (typeof IMPORT_HISTORY_STATUS)[keyof typeof IMPORT_HISTORY_STATUS];

const NON_BLOCKING_IMPORT_HISTORY_STATUSES = new Set<ImportHistoryStatus>([
  IMPORT_HISTORY_STATUS.FAILED,
  IMPORT_HISTORY_STATUS.ROLLED_BACK,
  IMPORT_HISTORY_STATUS.CANCELLED,
]);

const RESUMABLE_IMPORT_HISTORY_STATUSES = new Set<ImportHistoryStatus>([
  IMPORT_HISTORY_STATUS.IMPORTING,
  IMPORT_HISTORY_STATUS.IMPORTED,
  IMPORT_HISTORY_STATUS.FINALIZING,
  IMPORT_HISTORY_STATUS.FAILED,
]);

/** Imports in these states can still block duplicate re-import of the same data. */
export function isBlockingImportHistoryStatus(status: ImportHistoryStatus): boolean {
  return !NON_BLOCKING_IMPORT_HISTORY_STATUSES.has(status);
}

/** In-progress or failed imports can be resumed instead of starting a second import. */
export function isResumableImportHistoryStatus(status: ImportHistoryStatus): boolean {
  return RESUMABLE_IMPORT_HISTORY_STATUSES.has(status);
}

/** Exact-file BLOCK that should resume the matched in-progress import instead of aborting. */
export function shouldResumeBlockedDuplicateImport(result: DuplicateImportResult): boolean {
  return (
    result.recommendation === DUPLICATE_IMPORT_RECOMMENDATION.BLOCK_IMPORT &&
    result.matchedImport !== null &&
    isResumableImportHistoryStatus(result.matchedImport.status)
  );
}

/** One prior import attempt stored for duplicate comparison (caller-supplied). */
export type ImportHistoryRecord = {
  importId: string;
  importedAt: string;
  importedBy: string;
  reportType: string;
  rowCount: number;
  fileFingerprint: string;
  invoiceNumbers: readonly string[];
  rowFingerprints: readonly string[];
  status: ImportHistoryStatus;
  duplicateIndexStatus?: ImportDuplicateIndexStatus;
  duplicateMetadataStorage?: DuplicateMetadataStorage;
  duplicateMetadataComplete?: boolean;
  duplicateMetadataRowChunkCount?: number;
  duplicateMetadataInvoiceChunkCount?: number;
};

export type DuplicateImportMatchedImport = {
  importId: string;
  importedAt: string;
  importedBy: string;
  status: ImportHistoryStatus;
};

/** Row skip reason when SKIP_DUPLICATES excludes an overlapping sale at execute. */
export const DUPLICATE_IMPORT_ROW_SKIP_REASON = 'Already imported (duplicate).';

export type DuplicateImportResult = {
  status: DuplicateImportStatus;
  confidence: number;
  matchedImport: DuplicateImportMatchedImport | null;
  matchedInvoices: readonly string[];
  matchedRows: number;
  /**
   * Row fingerprints from the current import that overlap the matched history.
   * Used by execution to enforce SKIP_DUPLICATES (exclude these rows only).
   */
  duplicateRowFingerprints: readonly string[];
  duplicateReasons: readonly string[];
  recommendation: DuplicateImportRecommendation;
};

export type DetectDuplicateImportInput = {
  resolvedReview: ImportReviewViewModelWithResolution;
  importHistory: readonly ImportHistoryRecord[];
};

export type DuplicateImportFingerprints = {
  fileFingerprint: string;
  rowFingerprints: readonly string[];
  invoiceNumbers: readonly string[];
};
