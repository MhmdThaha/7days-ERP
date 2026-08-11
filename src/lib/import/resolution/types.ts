/**
 * Product Resolution types — in-memory row fixes during import review.
 */

import type { ImportReviewRowViewModel, ImportReviewViewModel } from '@/lib/import/review/types';
import type { ProductMatchCatalogEntry } from '@/lib/import/services/product-matching.service';

export const PRODUCT_RESOLUTION_CASE = {
  UNKNOWN_PRODUCT: 'UNKNOWN_PRODUCT',
  MULTIPLE_MATCHES: 'MULTIPLE_MATCHES',
  FUZZY_MATCH: 'FUZZY_MATCH',
  INACTIVE_PRODUCT: 'INACTIVE_PRODUCT',
  SYSTEM_CONFIGURATION_ERROR: 'SYSTEM_CONFIGURATION_ERROR',
  NONE: 'NONE',
} as const;

export type ReviewProductMatchKind =
  | 'matched'
  | 'suggested'
  | 'not-found'
  | 'choose'
  | 'skipped'
  | 'none';

export type ReviewProductMatchDisplay = {
  kind: ReviewProductMatchKind;
  label: string;
  value: string;
  needsAction: boolean;
};

export type ProductResolutionCase =
  (typeof PRODUCT_RESOLUTION_CASE)[keyof typeof PRODUCT_RESOLUTION_CASE];

export type ProductResolutionActionType =
  | 'select-existing'
  | 'skip-row'
  | 'create-placeholder'
  | 'accept-inactive';

export type ProductRowResolution = {
  action: ProductResolutionActionType;
  /** Selected catalog product id when action is select-existing or accept-inactive. */
  selectedProductId?: string;
  /** Display label for placeholder products (not persisted). */
  placeholderProductName?: string;
  resolvedInMemory: true;
};

export type ProductResolutionCatalogItem = ProductMatchCatalogEntry & {
  category?: string;
};

export type ResolvedImportReviewRow = ImportReviewRowViewModel & {
  productResolution?: ProductRowResolution;
};

export type ImportReviewViewModelWithResolution = Omit<ImportReviewViewModel, 'rows'> & {
  rows: readonly ResolvedImportReviewRow[];
};

export type ProductResolutionAction =
  | { type: 'select-existing'; productId: string }
  | { type: 'skip-row' }
  | { type: 'create-placeholder'; productName: string }
  | { type: 'accept-inactive'; productId: string };

export type RecalculateReviewRowInput = {
  row: ImportReviewRowViewModel;
  action: ProductResolutionAction;
  catalogProducts: readonly ProductMatchCatalogEntry[];
  duplicateRowNumbers?: readonly number[];
  stockByProductId?: ReadonlyMap<string, number>;
};
