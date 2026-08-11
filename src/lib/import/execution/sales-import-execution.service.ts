/**
 * Sales Import Execution — creates draft sales and import history only.
 *
 * Does not complete sales (no inventory mutation), reports, or dashboard updates.
 */

import 'server-only';

import { DomainError } from '@/lib/domain/errors';
import {
  DUPLICATE_IMPORT_RECOMMENDATION,
  DUPLICATE_IMPORT_ROW_SKIP_REASON,
  buildDuplicateImportFingerprints,
  buildDuplicateImportRowFingerprint,
} from '@/lib/import/duplicate';
import type {
  ExecuteSalesImportInput,
  ImportExecutionResult,
  SalesImportRowExecutionResult,
} from '@/lib/import/execution/sales-import-execution.types';
import { IMPORT_EXECUTION_STATUS } from '@/lib/import/execution/sales-import-execution.types';
import { IMPORT_HISTORY_STATUS } from '@/lib/import/duplicate';
import type { ValidatedRow } from '@/lib/import/engine/types';
import type { ExistingProductMatch } from '@/lib/import/services/conflict.service';
import {
  buildSaleImportCreateInput,
  type SaleImportCreateInput,
} from '@/lib/import/services/sale-import-commit.service';
import { groupSaleImportRows } from '@/lib/import/services/sale-import-grouping.service';
import type { ResolvedSaleImportGroup } from '@/lib/import/services/sale-import-product-resolver';
import type { ResolvedImportReviewRow } from '@/lib/import/resolution/types';
import {
  isSalesImportRowImportable,
  reviewRowSkipReason,
} from '@/lib/import/execution/sales-import-importability';
import { productRepository } from '@/lib/repositories/product.repository';
import { importHistoryRepository } from '@/lib/repositories/import-history.repository';
import { saleService } from '@/lib/services/sale.service';
import {
  CONFLICT_ENGINE_STATUS,
  type ConflictEngineResult,
} from '@/lib/import/services/conflict-engine.service';

export { isSalesImportRowImportable, reviewRowSkipReason };

/**
 * Executes a reviewed sales import: draft sales + one import-history document.
 * Aborts with no writes when duplicate protection recommends BLOCK_IMPORT.
 * When SKIP_DUPLICATES, excludes overlapping rows and imports only new rows.
 */
export async function executeSalesImport(
  input: ExecuteSalesImportInput,
): Promise<ImportExecutionResult> {
  const startedAt = new Date().toISOString();

  if (input.duplicateResult.recommendation === DUPLICATE_IMPORT_RECOMMENDATION.BLOCK_IMPORT) {
    return finalizeResult(
      {
        importId: null,
        imported: 0,
        skipped: 0,
        failed: 0,
        status: IMPORT_EXECUTION_STATUS.BLOCKED,
        saleIds: [],
        rowResults: [],
        warnings: [],
        errors: [],
      },
      startedAt,
    );
  }

  const fingerprints = buildDuplicateImportFingerprints(input.resolvedReview.rows);
  const rowResults: SalesImportRowExecutionResult[] = [];
  const skippedRowNumbers = new Set<number>();
  const skipDuplicateFingerprints =
    input.duplicateResult.recommendation === DUPLICATE_IMPORT_RECOMMENDATION.SKIP_DUPLICATES
      ? new Set(input.duplicateResult.duplicateRowFingerprints)
      : null;

  for (const row of input.resolvedReview.rows) {
    const skipReason = reviewRowSkipReason(row);

    if (skipReason) {
      skippedRowNumbers.add(row.rowNumber);
      rowResults.push({
        rowNumber: row.rowNumber,
        status: 'skipped',
        reason: skipReason,
      });
      continue;
    }

    if (skipDuplicateFingerprints) {
      const fingerprint = buildDuplicateImportRowFingerprint(row);

      if (fingerprint !== '' && skipDuplicateFingerprints.has(fingerprint)) {
        skippedRowNumbers.add(row.rowNumber);
        rowResults.push({
          rowNumber: row.rowNumber,
          status: 'skipped',
          reason: DUPLICATE_IMPORT_ROW_SKIP_REASON,
        });
      }
    }
  }

  const importableRows = input.resolvedReview.rows.filter((row) => !skippedRowNumbers.has(row.rowNumber));
  const groups = buildResolvedSaleImportGroups(importableRows);
  const saleIds: string[] = [];

  for (const group of groups) {
    const built = buildSaleImportCreateInput(group);

    if ('code' in built) {
      for (const rowNumber of group.rowNumbers) {
        rowResults.push({
          rowNumber,
          status: 'skipped',
          reason: built.message,
        });
        skippedRowNumbers.add(rowNumber);
      }

      continue;
    }

    try {
      const createInput = await resolveMissingSellingPrices(input.orgId, built);
      const draft = await saleService.create(input.orgId, createInput, input.userId);

      saleIds.push(draft.id);

      for (const rowNumber of group.rowNumbers) {
        rowResults.push({
          rowNumber,
          status: 'imported',
          saleId: draft.id,
        });
      }
    } catch (error) {
      const message = error instanceof DomainError ? error.message : 'Sale could not be created.';

      for (const rowNumber of group.rowNumbers) {
        rowResults.push({
          rowNumber,
          status: 'failed',
          reason: message,
        });
      }
    }
  }

  rowResults.sort((a, b) => a.rowNumber - b.rowNumber);

  const imported = rowResults.filter((entry) => entry.status === 'imported').length;
  const skipped = rowResults.filter((entry) => entry.status === 'skipped').length;
  const failed = rowResults.filter((entry) => entry.status === 'failed').length;
  const duplicateSkipsOnly =
    input.duplicateResult.recommendation === DUPLICATE_IMPORT_RECOMMENDATION.SKIP_DUPLICATES &&
    imported === 0 &&
    failed === 0 &&
    skipped > 0 &&
    rowResults.every(
      (entry) =>
        entry.status !== 'skipped' || entry.reason === DUPLICATE_IMPORT_ROW_SKIP_REASON,
    );
  const executionStatus = resolveExecutionStatus(imported, failed, skipped, duplicateSkipsOnly);
  const warnings = rowResults
    .filter((entry) => entry.status === 'skipped' && entry.reason)
    .map((entry) => `Row ${entry.rowNumber}: ${entry.reason}`);
  const errors = rowResults
    .filter((entry) => entry.status === 'failed' && entry.reason)
    .map((entry) => `Row ${entry.rowNumber}: ${entry.reason}`);

  if (imported === 0) {
    return finalizeResult(
      {
        importId: null,
        imported,
        skipped,
        failed,
        status: executionStatus,
        saleIds,
        rowResults,
        warnings,
        errors,
      },
      startedAt,
    );
  }

  const history = await importHistoryRepository.create(input.orgId, input.userId, {
    reportType: input.reportType,
    rowCount: input.resolvedReview.rows.length,
    rowsImported: imported,
    rowsSkipped: skipped,
    rowsFailed: failed,
    fileFingerprint: fingerprints.fileFingerprint,
    invoiceNumbers: fingerprints.invoiceNumbers,
    rowFingerprints: fingerprints.rowFingerprints,
    saleIds,
    lifecycleStatus: IMPORT_HISTORY_STATUS.IMPORTED,
    executionStatus,
  });

  return finalizeResult(
    {
      importId: history.importId,
      imported,
      skipped,
      failed,
      status: executionStatus,
      saleIds,
      rowResults,
      warnings,
      errors,
    },
    startedAt,
  );
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type ExecutionResultCore = Omit<
  ImportExecutionResult,
  'startedAt' | 'completedAt' | 'durationMs'
>;

function finalizeResult(result: ExecutionResultCore, startedAt: string): ImportExecutionResult {
  const completedAt = new Date().toISOString();
  const durationMs = Math.max(
    0,
    new Date(completedAt).getTime() - new Date(startedAt).getTime(),
  );

  return {
    ...result,
    startedAt,
    completedAt,
    durationMs,
  };
}

function resolveExecutionStatus(
  imported: number,
  failed: number,
  skipped: number,
  duplicateSkipsOnly = false,
) {
  if (imported === 0) {
    if (duplicateSkipsOnly) {
      return IMPORT_EXECUTION_STATUS.IMPORTED;
    }

    return IMPORT_EXECUTION_STATUS.FAILED;
  }

  if (failed > 0 || skipped > 0) {
    return IMPORT_EXECUTION_STATUS.PARTIAL;
  }

  return IMPORT_EXECUTION_STATUS.IMPORTED;
}

function buildResolvedSaleImportGroups(
  rows: readonly ResolvedImportReviewRow[],
): ResolvedSaleImportGroup[] {
  if (rows.length === 0) {
    return [];
  }

  const validatedRows = rows.map((row) => toValidatedRow(row));
  const groups = groupSaleImportRows(validatedRows);
  const reviewByRow = new Map(rows.map((row) => [row.rowNumber, row]));

  return groups.map((group) => ({
    ...group,
    lines: group.lines.map((line) => ({
      ...line,
      resolvedProduct: toExistingProductMatch(reviewByRow.get(line.rowNumber)!),
    })),
  }));
}

function toValidatedRow(row: ResolvedImportReviewRow): ValidatedRow {
  return {
    rowNumber: row.rowNumber,
    values: row.normalizedValues,
    issues: conflictIssuesToValidationIssues(row.conflictEngineResult),
    status:
      row.conflictEngineResult.status === CONFLICT_ENGINE_STATUS.WARNING ? 'warning' : 'valid',
  };
}

function conflictIssuesToValidationIssues(
  conflict: ConflictEngineResult,
): ValidatedRow['issues'] {
  return [
    ...conflict.conflicts.map((entry) => ({
      severity: 'error' as const,
      code: entry.code,
      message: entry.message,
      field: entry.field,
    })),
    ...conflict.warnings.map((entry) => ({
      severity: 'warning' as const,
      code: entry.code,
      message: entry.message,
      field: entry.field,
    })),
  ];
}

function toExistingProductMatch(row: ResolvedImportReviewRow): ExistingProductMatch {
  const match = row.productMatchResult!;
  const code =
    typeof row.normalizedValues['productCode'] === 'string'
      ? row.normalizedValues['productCode'].trim()
      : '';

  return {
    id: match.matchedProductId!,
    name: match.matchedProductName ?? '',
    code,
  };
}

async function resolveMissingSellingPrices(
  orgId: string,
  input: SaleImportCreateInput,
): Promise<SaleImportCreateInput> {
  const lines = await Promise.all(
    input.lines.map(async (line) => {
      if (line.sellingPrice > 0) {
        return line;
      }

      const product = await productRepository.getById(orgId, line.productId);

      if (!product) {
        throw new DomainError('NOT_FOUND', 'One or more products were not found');
      }

      return {
        ...line,
        sellingPrice: product.sellingPrice,
      };
    }),
  );

  return {
    ...input,
    lines,
  };
}
