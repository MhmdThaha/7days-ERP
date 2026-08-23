/**
 * Duplicate index health — per-import and per-organization coverage state.
 */

export const IMPORT_DUPLICATE_INDEX_STATUS = {
  PENDING: 'pending',
  COMPLETE: 'complete',
  FAILED: 'failed',
} as const;

export type ImportDuplicateIndexStatus =
  (typeof IMPORT_DUPLICATE_INDEX_STATUS)[keyof typeof IMPORT_DUPLICATE_INDEX_STATUS];

export const ORG_IMPORT_INDEX_COVERAGE = {
  UNKNOWN: 'unknown',
  INCOMPLETE: 'incomplete',
  REPAIRING: 'repairing',
  COMPLETE: 'complete',
} as const;

export type OrgImportIndexCoverage =
  (typeof ORG_IMPORT_INDEX_COVERAGE)[keyof typeof ORG_IMPORT_INDEX_COVERAGE];

export type OrgImportIndexMeta = {
  coverage: OrgImportIndexCoverage;
  updatedAt: string;
  updatedBy: string;
  lastRepairStartedAt: string | null;
  lastRepairCompletedAt: string | null;
  lastRepairError: string | null;
  blockingImportCount: number;
  incompleteImportCount: number;
};

export type RecordImportIndexWriteInput = {
  orgId: string;
  userId: string;
  importId: string;
  invoiceNumbers: readonly string[];
  rowFingerprints: readonly string[];
  lifecycleStatus: string;
  indexWriteSucceeded: boolean;
};
