/**
 * Pre-import validation for resolved sales import review payloads.
 */

import { DomainError } from '@/lib/domain/errors';
import { isSalesImportRowImportable } from '@/lib/import/execution/sales-import-importability';
import type { ImportReviewViewModelWithResolution } from '@/lib/import/resolution';

export function validateSalesImportReview(
  viewModel: ImportReviewViewModelWithResolution,
): void {
  if (viewModel.rows.length === 0) {
    throw new DomainError('VALIDATION_ERROR', 'The file has no rows to import.');
  }

  const importableRows = viewModel.rows.filter((row) => isSalesImportRowImportable(row));

  if (importableRows.length === 0) {
    throw new DomainError(
      'VALIDATION_ERROR',
      'No rows are ready to import. Resolve product issues or skip blocked rows.',
    );
  }
}
