/**
 * Sales Import commit pipeline — duplicate check, Phase 10A, Phase 10B.
 */

import 'server-only';

import { DomainError } from '@/lib/domain/errors';
import {
  DUPLICATE_IMPORT_RECOMMENDATION,
  type DuplicateImportResult,
} from '@/lib/import/duplicate';
import { duplicateResultNeedsUserConfirmation } from '@/lib/import/duplicate/duplicate-import-review';
import { detectDuplicateImportWithCandidateLookup } from '@/lib/import/duplicate/import-duplicate-index-candidate.service';
import { executeSalesImport } from '@/lib/import/execution/sales-import-execution.service';
import {
  IMPORT_EXECUTION_STATUS,
  type ImportExecutionResult,
} from '@/lib/import/execution/sales-import-execution.types';
import { finalizeSalesImportInventory } from '@/lib/import/finalization/inventory-finalization.service';
import type { InventoryFinalizationResult } from '@/lib/import/finalization/inventory-finalization.types';
import { importIndexHealthService } from '@/lib/import/duplicate/import-index-repair.service';
import {
  prepareSalesImportResolvedReview,
} from '@/lib/import/integration/prepare-sales-import-review';
import type { SalesImportResolutionInput } from '@/lib/import/integration/sales-import-resolutions';
import type { SalesImportPreparationContext } from '@/lib/import/preparation/sales-import-preparation.types';

import type { MappingConfig } from '@/lib/import/engine/types';

export type CommitSalesImportInput = {
  orgId: string;
  userId: string;
  bytes: Uint8Array;
  fileName: string;
  sheetName?: string;
  mapping: MappingConfig;
  resolutions: readonly SalesImportResolutionInput[];
  acknowledgeDuplicateRisk?: boolean;
  /** Row numbers the user chose not to import during duplicate review. */
  duplicateReviewSkippedRowNumbers?: readonly number[];
  preparation?: SalesImportPreparationContext;
};

export type SalesImportCommitPipelineResult = {
  status: 'success' | 'partial' | 'failed' | 'blocked' | 'duplicate_review';
  duplicateResult: DuplicateImportResult;
  execution: ImportExecutionResult | null;
  finalization: InventoryFinalizationResult | null;
  fileName: string;
  reportType: string;
};

export async function commitSalesImportPipeline(
  input: CommitSalesImportInput,
): Promise<SalesImportCommitPipelineResult> {
  const { resolvedReview, reportType } = await prepareSalesImportResolvedReview({
    orgId: input.orgId,
    bytes: input.bytes,
    fileName: input.fileName,
    sheetName: input.sheetName,
    mapping: input.mapping,
    resolutions: input.resolutions,
    preparation: input.preparation,
  });

  const duplicateResult = await detectDuplicateImportWithCandidateLookup(
    input.orgId,
    resolvedReview,
  );

  const needsDuplicateConfirmation =
    duplicateResultNeedsUserConfirmation(duplicateResult) &&
    !input.acknowledgeDuplicateRisk;

  if (needsDuplicateConfirmation) {
    return {
      status: 'duplicate_review',
      duplicateResult,
      execution: null,
      finalization: null,
      fileName: input.fileName,
      reportType,
    };
  }

  const execution = await executeSalesImport({
    resolvedReview,
    duplicateResult,
    reportType,
    orgId: input.orgId,
    userId: input.userId,
    duplicateReviewSkippedRowNumbers: input.duplicateReviewSkippedRowNumbers,
    acknowledgeDuplicateRisk: input.acknowledgeDuplicateRisk,
  });

  if (execution.status === IMPORT_EXECUTION_STATUS.BLOCKED) {
    return {
      status: 'blocked',
      duplicateResult,
      execution,
      finalization: null,
      fileName: input.fileName,
      reportType,
    };
  }

  // All rows were intentional duplicate skips — nothing to finalize; treat as success.
  if (
    execution.imported === 0 &&
    execution.failed === 0 &&
    (duplicateResult.recommendation === DUPLICATE_IMPORT_RECOMMENDATION.SKIP_DUPLICATES ||
      (input.duplicateReviewSkippedRowNumbers?.length ?? 0) > 0)
  ) {
    scheduleDeferredImportDuplicateIndexIfNeeded({
      orgId: input.orgId,
      userId: input.userId,
      execution,
      pipelineStatus: 'success',
    });

    return {
      status: 'success',
      duplicateResult,
      execution,
      finalization: null,
      fileName: input.fileName,
      reportType,
    };
  }

  if (execution.imported === 0) {
    scheduleDeferredImportDuplicateIndexIfNeeded({
      orgId: input.orgId,
      userId: input.userId,
      execution,
      pipelineStatus: 'failed',
    });

    return {
      status: 'failed',
      duplicateResult,
      execution,
      finalization: null,
      fileName: input.fileName,
      reportType,
    };
  }

  const finalization = await finalizeSalesImportInventory({
    executionResult: execution,
    orgId: input.orgId,
    userId: input.userId,
  });

  const status =
    finalization.status === 'COMPLETED'
      ? 'success'
      : finalization.status === 'PARTIAL'
        ? 'partial'
        : 'failed';

  const result = {
    status,
    duplicateResult,
    execution,
    finalization,
    fileName: input.fileName,
    reportType,
  } as const;

  scheduleDeferredImportDuplicateIndexIfNeeded({
    orgId: input.orgId,
    userId: input.userId,
    execution,
    pipelineStatus: result.status,
  });

  return result;
}

function scheduleDeferredImportDuplicateIndexIfNeeded(input: {
  orgId: string;
  userId: string;
  execution: ImportExecutionResult;
  pipelineStatus: SalesImportCommitPipelineResult['status'];
}): void {
  if (!input.execution.importId) {
    return;
  }

  if (input.execution.status === IMPORT_EXECUTION_STATUS.BLOCKED) {
    return;
  }

  if (input.pipelineStatus === 'duplicate_review' || input.pipelineStatus === 'blocked') {
    return;
  }

  importIndexHealthService.scheduleDeferredImportDuplicateIndexWrite({
    orgId: input.orgId,
    userId: input.userId,
    importId: input.execution.importId,
  });
}

export function salesImportCommitErrorMessage(result: SalesImportCommitPipelineResult): string {
  if (result.status === 'blocked') {
    const reasons = result.duplicateResult.duplicateReasons.join(' ');

    return reasons.length > 0
      ? `This import looks like a duplicate. ${reasons}`
      : 'This import looks like a duplicate of a previous import.';
  }

  if (result.execution?.errors[0]) {
    return result.execution.errors[0];
  }

  if (result.finalization?.errors[0]) {
    return result.finalization.errors[0];
  }

  return 'The sales import could not be completed.';
}

export function assertSalesImportCommitSucceeded(result: SalesImportCommitPipelineResult): void {
  if (result.status === 'duplicate_review') {
    throw new DomainError('VALIDATION_ERROR', 'Duplicate import review is required before commit.');
  }

  if (result.status === 'blocked') {
    throw new DomainError('VALIDATION_ERROR', salesImportCommitErrorMessage(result));
  }

  if (result.status === 'failed' && (result.execution?.imported ?? 0) === 0) {
    throw new DomainError('VALIDATION_ERROR', salesImportCommitErrorMessage(result));
  }
}
