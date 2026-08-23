/**
 * Applies client product-resolution choices to a server-rebuilt import review.
 */

import {
  recalculateReviewRowAfterResolution,
  recomputeImportReviewOverview,
  type ImportReviewViewModelWithResolution,
  type ProductResolutionAction,
  type ProductResolutionActionType,
  type ProductResolutionCatalogItem,
  type ResolvedImportReviewRow,
} from '@/lib/import/resolution';
import type { ImportReviewViewModel } from '@/lib/import/review/types';

export type SalesImportResolutionInput = {
  rowNumber: number;
  action: ProductResolutionActionType;
  selectedProductId?: string;
  placeholderProductName?: string;
};

export function applySalesImportResolutions(
  viewModel: ImportReviewViewModel,
  catalogItems: readonly ProductResolutionCatalogItem[],
  stockByProductId: ReadonlyMap<string, number>,
  resolutions: readonly SalesImportResolutionInput[],
): ImportReviewViewModelWithResolution {
  const resolutionByRow = new Map(resolutions.map((entry) => [entry.rowNumber, entry]));

  const rows = viewModel.rows.map((row): ResolvedImportReviewRow => {
    const resolution = resolutionByRow.get(row.rowNumber);

    if (!resolution) {
      return { ...row };
    }

    return recalculateReviewRowAfterResolution({
      row,
      action: toProductResolutionAction(resolution),
      catalogProducts: catalogItems,
      stockByProductId,
    });
  });

  return {
    ...viewModel,
    rows,
    overview: recomputeImportReviewOverview(viewModel.overview, rows),
  };
}

function toProductResolutionAction(
  resolution: SalesImportResolutionInput,
): ProductResolutionAction {
  switch (resolution.action) {
    case 'select-existing':
      if (!resolution.selectedProductId) {
        throw new Error(`Row ${resolution.rowNumber} is missing a selected product.`);
      }

      return { type: 'select-existing', productId: resolution.selectedProductId };
    case 'skip-row':
      return { type: 'skip-row' };
    case 'create-placeholder':
      return {
        type: 'create-placeholder',
        productName: resolution.placeholderProductName?.trim() || 'Placeholder product',
      };
    case 'accept-inactive':
      if (!resolution.selectedProductId) {
        throw new Error(`Row ${resolution.rowNumber} is missing a selected product.`);
      }

      return { type: 'accept-inactive', productId: resolution.selectedProductId };
    default:
      return { type: 'skip-row' };
  }
}
