/**
 * Product Resolution — single-row re-analysis using existing engines only.
 *
 * No Firestore writes, no full pipeline rebuild, no changes to matching/conflict/confidence logic.
 */

import type { ImportReviewOverviewViewModel, ImportReviewRowViewModel } from '@/lib/import/review/types';
import type {
  ProductResolutionAction,
  ProductResolutionCase,
  ProductRowResolution,
  RecalculateReviewRowInput,
  ResolvedImportReviewRow,
  ReviewProductMatchDisplay,
} from '@/lib/import/resolution/types';
import { PRODUCT_RESOLUTION_CASE } from '@/lib/import/resolution/types';
import { calculateImportConfidence } from '@/lib/import/services/confidence-engine.service';
import { AUTO_IMPORT_RECOMMENDATION } from '@/lib/import/services/confidence-engine.service';
import {
  classifyImportRowConflict,
  CONFLICT_ENGINE_STATUS,
  IMPORT_CONFLICT_CODE,
  type ConflictEngineResult,
} from '@/lib/import/services/conflict-engine.service';
import {
  buildProductMatchCatalog,
  matchProduct,
  PRODUCT_MATCH_STATUS,
  type ProductMatchCatalog,
  type ProductMatchCatalogEntry,
  type ProductMatchResult,
} from '@/lib/import/services/product-matching.service';

const MANUAL_RESOLUTION_REASON = 'Manual Resolution';

export function getProductResolutionCase(row: ImportReviewRowViewModel): ProductResolutionCase {
  if (
    row.conflictEngineResult.conflicts.some(
      (entry) => entry.code === IMPORT_CONFLICT_CODE.SYSTEM_CONFIGURATION_ERROR,
    )
  ) {
    return PRODUCT_RESOLUTION_CASE.SYSTEM_CONFIGURATION_ERROR;
  }

  if (
    row.conflictEngineResult.conflicts.some(
      (entry) => entry.code === IMPORT_CONFLICT_CODE.UNKNOWN_PRODUCT,
    )
  ) {
    return PRODUCT_RESOLUTION_CASE.UNKNOWN_PRODUCT;
  }

  if (
    row.conflictEngineResult.conflicts.some(
      (entry) => entry.code === IMPORT_CONFLICT_CODE.MULTIPLE_PRODUCTS,
    )
  ) {
    return PRODUCT_RESOLUTION_CASE.MULTIPLE_MATCHES;
  }

  if (
    row.productMatchResult?.status === PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION &&
    row.productMatchResult.reason === 'Fuzzy Name Match'
  ) {
    return PRODUCT_RESOLUTION_CASE.FUZZY_MATCH;
  }

  if (
    row.conflictEngineResult.warnings.some(
      (entry) => entry.code === IMPORT_CONFLICT_CODE.INACTIVE_PRODUCT,
    ) ||
    (row.productMatchResult?.status === PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION &&
      row.productMatchResult.reason === 'Inactive Product')
  ) {
    return PRODUCT_RESOLUTION_CASE.INACTIVE_PRODUCT;
  }

  return PRODUCT_RESOLUTION_CASE.NONE;
}

export function needsProductResolution(row: ImportReviewRowViewModel): boolean {
  const resolutionCase = getProductResolutionCase(row);

  return (
    resolutionCase === PRODUCT_RESOLUTION_CASE.UNKNOWN_PRODUCT ||
    resolutionCase === PRODUCT_RESOLUTION_CASE.MULTIPLE_MATCHES ||
    resolutionCase === PRODUCT_RESOLUTION_CASE.FUZZY_MATCH ||
    resolutionCase === PRODUCT_RESOLUTION_CASE.INACTIVE_PRODUCT
  );
}

export function getProductResolutionActionLabel(row: ImportReviewRowViewModel): string {
  switch (getProductResolutionCase(row)) {
    case PRODUCT_RESOLUTION_CASE.FUZZY_MATCH:
    case PRODUCT_RESOLUTION_CASE.MULTIPLE_MATCHES:
    case PRODUCT_RESOLUTION_CASE.UNKNOWN_PRODUCT:
    case PRODUCT_RESOLUTION_CASE.INACTIVE_PRODUCT:
      return 'Choose product';
    case PRODUCT_RESOLUTION_CASE.SYSTEM_CONFIGURATION_ERROR:
      return 'View issue';
    default:
      return 'Choose product';
  }
}

export function getReviewProductMatchDisplay(
  row: ImportReviewRowViewModel,
): ReviewProductMatchDisplay {
  if (row.productResolution?.action === 'skip-row') {
    return {
      kind: 'skipped',
      label: 'Product',
      value: 'Skipped',
      needsAction: false,
    };
  }

  const match = row.productMatchResult;
  const resolutionCase = getProductResolutionCase(row);

  if (match?.status === PRODUCT_MATCH_STATUS.MATCHED) {
    return {
      kind: 'matched',
      label: 'Matched product',
      value: match.matchedProductName ?? '—',
      needsAction: false,
    };
  }

  if (resolutionCase === PRODUCT_RESOLUTION_CASE.FUZZY_MATCH) {
    return {
      kind: 'suggested',
      label: 'Suggested product',
      value: match?.matchedProductName ?? '—',
      needsAction: true,
    };
  }

  if (resolutionCase === PRODUCT_RESOLUTION_CASE.MULTIPLE_MATCHES) {
    const candidateCount = match?.candidates?.length ?? 0;

    return {
      kind: 'choose',
      label: 'Choose product',
      value:
        candidateCount > 0
          ? `${candidateCount} possible match${candidateCount === 1 ? '' : 'es'}`
          : 'Choose product',
      needsAction: true,
    };
  }

  if (resolutionCase === PRODUCT_RESOLUTION_CASE.UNKNOWN_PRODUCT) {
    return {
      kind: 'not-found',
      label: 'Product',
      value: 'Not found',
      needsAction: true,
    };
  }

  return {
    kind: 'none',
    label: 'Product',
    value: match?.matchedProductName ?? '—',
    needsAction: false,
  };
}

export function isReadOnlyProductResolution(row: ImportReviewRowViewModel): boolean {
  return getProductResolutionCase(row) === PRODUCT_RESOLUTION_CASE.SYSTEM_CONFIGURATION_ERROR;
}

export function getResolutionCandidates(
  row: ImportReviewRowViewModel,
  catalog: ProductMatchCatalog,
): readonly ProductMatchCatalogEntry[] {
  const resolutionCase = getProductResolutionCase(row);

  if (resolutionCase === PRODUCT_RESOLUTION_CASE.MULTIPLE_MATCHES) {
    const candidateIds = new Set(
      (row.productMatchResult?.candidates ?? []).map((candidate) => candidate.productId),
    );

    return catalog.products.filter((product) => candidateIds.has(product.id));
  }

  if (resolutionCase === PRODUCT_RESOLUTION_CASE.FUZZY_MATCH && row.productMatchResult?.matchedProductId) {
    const suggested = catalog.products.find(
      (product) => product.id === row.productMatchResult?.matchedProductId,
    );

    return suggested ? [suggested] : [];
  }

  if (resolutionCase === PRODUCT_RESOLUTION_CASE.INACTIVE_PRODUCT && row.productMatchResult) {
    const matched = catalog.products.find(
      (product) => product.id === row.productMatchResult?.matchedProductId,
    );

    return matched ? [matched] : [];
  }

  return catalog.products;
}

/**
 * Re-runs product match (or applies a manual selection), then conflict + confidence
 * for a single row. Does not rebuild header/report detection or the full pipeline.
 */
export function recalculateReviewRowAfterResolution(
  input: RecalculateReviewRowInput,
): ResolvedImportReviewRow {
  const catalog = buildProductMatchCatalog(input.catalogProducts);
  const resolution = mapResolutionAction(input.action);

  if (resolution.action === 'skip-row') {
    return buildSkippedRow(input.row, resolution);
  }

  if (resolution.action === 'create-placeholder') {
    return buildPlaceholderRow(input.row, resolution, catalog);
  }

  const selectedProduct = resolution.selectedProductId
    ? catalog.products.find((product) => product.id === resolution.selectedProductId)
    : undefined;

  if (!selectedProduct) {
    throw new Error('Selected product was not found in the in-memory catalog.');
  }

  const productMatchResult =
    resolution.action === 'accept-inactive'
      ? buildManualProductMatch(selectedProduct, 'Inactive product accepted manually')
      : buildManualProductMatch(selectedProduct, MANUAL_RESOLUTION_REASON);

  return finalizeResolvedRow(input.row, productMatchResult, resolution, {
    catalog,
    duplicateRowNumbers: input.duplicateRowNumbers,
    stockByProductId: input.stockByProductId,
  });
}

export function recomputeImportReviewOverview(
  baseOverview: ImportReviewOverviewViewModel,
  rows: readonly ImportReviewRowViewModel[],
): ImportReviewOverviewViewModel {
  let readyRows = 0;
  let warningRows = 0;
  let errorRows = 0;
  let confidenceTotal = 0;
  let autoImportEligibleRows = 0;
  let blockedRows = 0;

  for (const row of rows) {
    switch (row.conflictEngineResult.status) {
      case CONFLICT_ENGINE_STATUS.READY:
        readyRows += 1;
        break;
      case CONFLICT_ENGINE_STATUS.WARNING:
        warningRows += 1;
        break;
      case CONFLICT_ENGINE_STATUS.ERROR:
        errorRows += 1;
        break;
      default:
        break;
    }

    confidenceTotal += row.confidenceResult.confidenceScore;

    if (row.confidenceResult.autoImportRecommendation === AUTO_IMPORT_RECOMMENDATION.AUTO_IMPORT) {
      autoImportEligibleRows += 1;
    }

    if (row.confidenceResult.autoImportRecommendation === AUTO_IMPORT_RECOMMENDATION.BLOCK_IMPORT) {
      blockedRows += 1;
    }
  }

  return {
    ...baseOverview,
    totalRows: rows.length,
    readyRows,
    warningRows,
    errorRows,
    averageConfidence: rows.length === 0 ? 0 : confidenceTotal / rows.length,
    autoImportEligibleRows,
    blockedRows,
  };
}

export function applySingleRowResolution(
  viewModel: { overview: ImportReviewOverviewViewModel; rows: readonly ImportReviewRowViewModel[] },
  updatedRow: ResolvedImportReviewRow,
): {
  overview: ImportReviewOverviewViewModel;
  rows: ResolvedImportReviewRow[];
} {
  const rows = viewModel.rows.map((row) =>
    row.rowNumber === updatedRow.rowNumber ? updatedRow : row,
  ) as ResolvedImportReviewRow[];

  return {
    rows,
    overview: recomputeImportReviewOverview(viewModel.overview, rows),
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function mapResolutionAction(action: ProductResolutionAction): ProductRowResolution {
  switch (action.type) {
    case 'select-existing':
      return {
        action: 'select-existing',
        selectedProductId: action.productId,
        resolvedInMemory: true,
      };
    case 'skip-row':
      return { action: 'skip-row', resolvedInMemory: true };
    case 'create-placeholder':
      return {
        action: 'create-placeholder',
        placeholderProductName: action.productName,
        resolvedInMemory: true,
      };
    case 'accept-inactive':
      return {
        action: 'accept-inactive',
        selectedProductId: action.productId,
        resolvedInMemory: true,
      };
    default:
      return { action: 'skip-row', resolvedInMemory: true };
  }
}

function buildManualProductMatch(
  product: ProductMatchCatalogEntry,
  reason: string,
): ProductMatchResult {
  return {
    status: PRODUCT_MATCH_STATUS.MATCHED,
    matchedProductId: product.id,
    matchedProductName: product.name,
    confidence: 100,
    reason,
  };
}

function finalizeResolvedRow(
  row: ImportReviewRowViewModel,
  productMatchResult: ProductMatchResult | null,
  resolution: ProductRowResolution,
  context: {
    catalog: ProductMatchCatalog;
    duplicateRowNumbers?: readonly number[];
    stockByProductId?: ReadonlyMap<string, number>;
  },
): ResolvedImportReviewRow {
  const rematchedProduct =
    productMatchResult ??
    matchProduct(
      {
        productName: readString(row.normalizedValues['productName']),
        productCode: readString(row.normalizedValues['productCode']),
        unit: readString(row.normalizedValues['unit']),
      },
      context.catalog,
    );

  const currentStock =
    rematchedProduct.matchedProductId != null
      ? (context.stockByProductId?.get(rematchedProduct.matchedProductId) ?? null)
      : null;

  const conflictEngineResult = classifyImportRowConflict(
    {
      rowNumber: row.rowNumber,
      values: row.normalizedValues,
      productMatchResult: rematchedProduct,
      reportDetectionResult: row.reportDetectionResult,
    },
    {
      duplicateRowNumbers: context.duplicateRowNumbers,
      currentStock,
    },
  );

  const confidenceResult = calculateImportConfidence({
    reportDetectionResult: row.reportDetectionResult,
    productMatchResult: rematchedProduct,
    conflictEngineResult,
  });

  return {
    ...row,
    productMatchResult: rematchedProduct,
    conflictEngineResult,
    confidenceResult,
    productResolution: resolution,
  };
}

function buildSkippedRow(
  row: ImportReviewRowViewModel,
  resolution: ProductRowResolution,
): ResolvedImportReviewRow {
  const conflictEngineResult: ConflictEngineResult = {
    status: CONFLICT_ENGINE_STATUS.WARNING,
    conflicts: [],
    warnings: [
      {
        code: IMPORT_CONFLICT_CODE.UNKNOWN_PRODUCT,
        message: 'Row skipped during product resolution.',
      },
    ],
    blockingReason: null,
    recommendedAction: 'Skip this row during import.',
    confidencePenalty: 0,
  };

  const confidenceResult = calculateImportConfidence({
    reportDetectionResult: row.reportDetectionResult,
    productMatchResult: null,
    conflictEngineResult,
  });

  return {
    ...row,
    productMatchResult: null,
    conflictEngineResult,
    confidenceResult,
    productResolution: resolution,
  };
}

function buildPlaceholderRow(
  row: ImportReviewRowViewModel,
  resolution: ProductRowResolution,
  catalog: ProductMatchCatalog,
): ResolvedImportReviewRow {
  const placeholderName =
    resolution.placeholderProductName?.trim() ||
    readString(row.normalizedValues['productName']) ||
    'New product';

  const productMatchResult: ProductMatchResult = {
    status: PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION,
    matchedProductId: null,
    matchedProductName: placeholderName,
    confidence: 0,
    reason: 'Create Product Placeholder',
  };

  return finalizeResolvedRow(row, productMatchResult, resolution, { catalog });
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

export function extractDuplicateRowNumbers(row: ImportReviewRowViewModel): readonly number[] {
  const warning = row.conflictEngineResult.warnings.find(
    (entry) => entry.code === IMPORT_CONFLICT_CODE.DUPLICATE_ROW_IN_FILE,
  );

  const duplicateRowNumbers = warning?.metadata?.duplicateRowNumbers;

  return Array.isArray(duplicateRowNumbers)
    ? duplicateRowNumbers.filter((value): value is number => typeof value === 'number')
    : [];
}
