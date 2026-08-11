/**
 * Sales Import commit pipeline — duplicate check, Phase 10A, Phase 10B.
 */

import 'server-only';

import { DomainError } from '@/lib/domain/errors';
import {
  detectDuplicateImport,
  DUPLICATE_IMPORT_RECOMMENDATION,
  type DuplicateImportResult,
} from '@/lib/import/duplicate';
import { executeSalesImport } from '@/lib/import/execution/sales-import-execution.service';
import {
  IMPORT_EXECUTION_STATUS,
  type ImportExecutionResult,
} from '@/lib/import/execution/sales-import-execution.types';
import { finalizeSalesImportInventory } from '@/lib/import/finalization/inventory-finalization.service';
import type { InventoryFinalizationResult } from '@/lib/import/finalization/inventory-finalization.types';
import { loadProductCatalogForReview } from '@/lib/import/integration/product-catalog-for-review';
import {
  applySalesImportResolutions,
  type SalesImportResolutionInput,
} from '@/lib/import/integration/sales-import-resolutions';
import { validateSalesImportReview } from '@/lib/import/integration/validate-sales-import-review';
import type { MappingConfig } from '@/lib/import/engine/types';
import { buildImportReview } from '@/lib/import/pipeline/analysis-pipeline';
import type { SalesImportPreparationContext } from '@/lib/import/preparation/sales-import-preparation.types';
import { prepareImportFile } from '@/lib/import/services/import.service';
import { importHistoryRepository } from '@/lib/repositories/import-history.repository';

export type CommitSalesImportInput = {
  orgId: string;
  userId: string;
  bytes: Uint8Array;
  fileName: string;
  sheetName?: string;
  mapping: MappingConfig;
  resolutions: readonly SalesImportResolutionInput[];
  acknowledgeDuplicateRisk?: boolean;
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
  const { parsed, headerDetection, reportDetection } = prepareImportFile(
    input.bytes,
    'sale',
    {
      fileName: input.fileName,
      sheetName: input.sheetName,
    },
  );

  const { catalogItems, stockByProductId } = await loadProductCatalogForReview(input.orgId);
  const productCatalog = catalogItems.map(({ category: _category, ...entry }) => entry);

  const { viewModel } = buildImportReview({
    fileName: input.fileName,
    entityType: 'sale',
    parsed,
    headerDetection,
    reportDetection,
    mapping: input.mapping,
    productCatalog,
    stockByProductId: new Map(Object.entries(stockByProductId)),
    preparation: input.preparation ?? {},
  });

  const resolvedReview = applySalesImportResolutions(
    viewModel,
    catalogItems,
    new Map(Object.entries(stockByProductId)),
    input.resolutions,
  );

  validateSalesImportReview(resolvedReview);

  const importHistory = await importHistoryRepository.list(input.orgId);
  const duplicateResult = detectDuplicateImport({
    resolvedReview,
    importHistory,
  });

  if (duplicateResult.recommendation === DUPLICATE_IMPORT_RECOMMENDATION.BLOCK_IMPORT) {
    return {
      status: 'blocked',
      duplicateResult,
      execution: null,
      finalization: null,
      fileName: input.fileName,
      reportType: viewModel.overview.detectedReportType,
    };
  }

  if (
    (duplicateResult.recommendation === DUPLICATE_IMPORT_RECOMMENDATION.REVIEW ||
      duplicateResult.recommendation === DUPLICATE_IMPORT_RECOMMENDATION.SKIP_DUPLICATES) &&
    !input.acknowledgeDuplicateRisk
  ) {
    return {
      status: 'duplicate_review',
      duplicateResult,
      execution: null,
      finalization: null,
      fileName: input.fileName,
      reportType: viewModel.overview.detectedReportType,
    };
  }

  const execution = await executeSalesImport({
    resolvedReview,
    duplicateResult,
    reportType: viewModel.overview.detectedReportType,
    orgId: input.orgId,
    userId: input.userId,
  });

  if (execution.status === IMPORT_EXECUTION_STATUS.BLOCKED) {
    return {
      status: 'blocked',
      duplicateResult,
      execution,
      finalization: null,
      fileName: input.fileName,
      reportType: viewModel.overview.detectedReportType,
    };
  }

  // All rows were intentional duplicate skips — nothing to finalize; treat as success.
  if (
    execution.imported === 0 &&
    execution.failed === 0 &&
    duplicateResult.recommendation === DUPLICATE_IMPORT_RECOMMENDATION.SKIP_DUPLICATES
  ) {
    return {
      status: 'success',
      duplicateResult,
      execution,
      finalization: null,
      fileName: input.fileName,
      reportType: viewModel.overview.detectedReportType,
    };
  }

  if (execution.imported === 0) {
    return {
      status: 'failed',
      duplicateResult,
      execution,
      finalization: null,
      fileName: input.fileName,
      reportType: viewModel.overview.detectedReportType,
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

  return {
    status,
    duplicateResult,
    execution,
    finalization,
    fileName: input.fileName,
    reportType: viewModel.overview.detectedReportType,
  };
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
