export {
  applySingleRowResolution,
  extractDuplicateRowNumbers,
  getProductResolutionActionLabel,
  getProductResolutionCase,
  getResolutionCandidates,
  getReviewProductMatchDisplay,
  isReadOnlyProductResolution,
  needsProductResolution,
  recalculateReviewRowAfterResolution,
  recomputeImportReviewOverview,
} from '@/lib/import/resolution/product-resolution.service';

export {
  PRODUCT_RESOLUTION_CASE,
  type ImportReviewViewModelWithResolution,
  type ProductResolutionAction,
  type ProductResolutionActionType,
  type ProductResolutionCase,
  type ProductResolutionCatalogItem,
  type ProductRowResolution,
  type RecalculateReviewRowInput,
  type ResolvedImportReviewRow,
  type ReviewProductMatchDisplay,
  type ReviewProductMatchKind,
} from '@/lib/import/resolution/types';
