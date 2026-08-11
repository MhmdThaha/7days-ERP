/**
 * Helpers for continuing a sales import after a partial commit.
 */

import { isSalesImportRowImportable } from '@/lib/import/execution/sales-import-importability';
import type { SalesImportRowExecutionResult } from '@/lib/import/execution/sales-import-execution.types';
import type { ImportReviewViewModelWithResolution } from '@/lib/import/resolution/types';
import type { SalesImportResolutionInput } from '@/lib/import/integration/sales-import-resolutions';
import { computeImportReviewSummary } from '@/lib/import/review/import-review-buckets';

export function collectImportedRowNumbers(
  rowResults: readonly SalesImportRowExecutionResult[],
): readonly number[] {
  return rowResults
    .filter((entry) => entry.status === 'imported')
    .map((entry) => entry.rowNumber);
}

export function buildRemainingSalesImportReview(
  review: ImportReviewViewModelWithResolution,
  importedRowNumbers: readonly number[],
): ImportReviewViewModelWithResolution {
  const imported = new Set(importedRowNumbers);

  const remainingRows = review.rows.filter(
    (row) =>
      !imported.has(row.rowNumber) &&
      !isSalesImportRowImportable(row) &&
      row.productResolution?.action !== 'skip-row',
  );

  const summary = computeImportReviewSummary(remainingRows);

  return {
    ...review,
    overview: {
      ...review.overview,
      totalRows: remainingRows.length,
      readyRows: summary.ready,
      warningRows: summary.needsAttention,
      errorRows: summary.errors,
      blockedRows: summary.errors + summary.needsAttention,
      autoImportEligibleRows: 0,
    },
    rows: remainingRows,
  };
}

export function countRemainingUnresolvedSales(
  review: ImportReviewViewModelWithResolution | null,
  importedRowNumbers: readonly number[],
): number {
  if (!review) {
    return 0;
  }

  return buildRemainingSalesImportReview(review, importedRowNumbers).rows.length;
}

/** Merge owner resolutions with skip actions for rows already imported from this file. */
export function mergeResolutionsWithImportedSkips(
  resolutions: readonly SalesImportResolutionInput[],
  importedRowNumbers: readonly number[],
): SalesImportResolutionInput[] {
  const byRow = new Map(resolutions.map((entry) => [entry.rowNumber, entry]));

  for (const rowNumber of importedRowNumbers) {
    if (!byRow.has(rowNumber)) {
      byRow.set(rowNumber, { rowNumber, action: 'skip-row' });
    }
  }

  return [...byRow.values()];
}
