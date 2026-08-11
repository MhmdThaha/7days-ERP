/**
 * Sales Import Execution types — Phase 10A write path (sales + import history only).
 */

import type { DuplicateImportResult } from '@/lib/import/duplicate';
import type { ImportHistoryStatus } from '@/lib/import/duplicate';
import type { ImportReviewViewModelWithResolution } from '@/lib/import/resolution/types';

export const IMPORT_EXECUTION_STATUS = {
  BLOCKED: 'BLOCKED',
  IMPORTED: 'IMPORTED',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
} as const;

export type ImportExecutionStatus =
  (typeof IMPORT_EXECUTION_STATUS)[keyof typeof IMPORT_EXECUTION_STATUS];

export type SalesImportRowExecutionStatus = 'imported' | 'skipped' | 'failed';

export type SalesImportRowExecutionResult = {
  rowNumber: number;
  status: SalesImportRowExecutionStatus;
  saleId?: string;
  reason?: string;
};

export type ImportExecutionResult = {
  importId: string | null;
  imported: number;
  skipped: number;
  failed: number;
  status: ImportExecutionStatus;
  saleIds: readonly string[];
  rowResults: readonly SalesImportRowExecutionResult[];
  startedAt: string;
  completedAt: string;
  durationMs: number;
  warnings: readonly string[];
  errors: readonly string[];
};

export type ExecuteSalesImportInput = {
  resolvedReview: ImportReviewViewModelWithResolution;
  duplicateResult: DuplicateImportResult;
  reportType: string;
  orgId: string;
  userId: string;
};

export type CreateImportHistoryInput = {
  reportType: string;
  rowCount: number;
  rowsImported: number;
  rowsSkipped: number;
  rowsFailed: number;
  fileFingerprint: string;
  invoiceNumbers: readonly string[];
  rowFingerprints: readonly string[];
  saleIds: readonly string[];
  lifecycleStatus: ImportHistoryStatus;
  executionStatus: ImportExecutionStatus;
};
