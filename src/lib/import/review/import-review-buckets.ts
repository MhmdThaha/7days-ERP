/**
 * Owner-facing import review buckets — UI classification only.
 * Reuses existing importability and resolution rules; no engine changes.
 */

import { isSalesImportRowImportable } from '@/lib/import/execution/sales-import-importability';
import type { ResolvedImportReviewRow } from '@/lib/import/resolution/types';
import {
  getProductResolutionCase,
  getReviewProductMatchDisplay,
  isReadOnlyProductResolution,
  needsProductResolution,
} from '@/lib/import/resolution/product-resolution.service';
import { PRODUCT_RESOLUTION_CASE } from '@/lib/import/resolution/types';
import type { ImportReviewRowViewModel } from '@/lib/import/review/types';
import { CONFLICT_ENGINE_STATUS } from '@/lib/import/services/conflict-engine.service';

export type ImportReviewRowBucket = 'ready' | 'needs-attention' | 'error';

export type ImportReviewSummary = {
  total: number;
  ready: number;
  needsAttention: number;
  errors: number;
  importableCount: number;
};

export type OwnerFacingRowStatus = {
  label: string;
  bucket: ImportReviewRowBucket;
};

export function getImportReviewRowBucket(row: ImportReviewRowViewModel): ImportReviewRowBucket {
  if (isSalesImportRowImportable(row as ResolvedImportReviewRow)) {
    return 'ready';
  }

  if (isReadOnlyProductResolution(row)) {
    return 'error';
  }

  if (row.productResolution?.action === 'skip-row') {
    return 'error';
  }

  const resolutionCase = getProductResolutionCase(row);

  if (
    needsProductResolution(row) &&
    !row.productResolution &&
    resolutionCase !== PRODUCT_RESOLUTION_CASE.UNKNOWN_PRODUCT
  ) {
    return 'needs-attention';
  }

  return 'error';
}

export function getOwnerFacingRowStatus(row: ImportReviewRowViewModel): OwnerFacingRowStatus {
  const bucket = getImportReviewRowBucket(row);

  switch (bucket) {
    case 'ready':
      return { label: 'Ready to import', bucket };
    case 'needs-attention':
      return { label: 'Needs your attention', bucket };
    default:
      return { label: 'Cannot import yet', bucket };
  }
}

export function computeImportReviewSummary(
  rows: readonly ImportReviewRowViewModel[],
): ImportReviewSummary {
  let ready = 0;
  let needsAttention = 0;
  let errors = 0;

  for (const row of rows) {
    const bucket = getImportReviewRowBucket(row);

    switch (bucket) {
      case 'ready':
        ready += 1;
        break;
      case 'needs-attention':
        needsAttention += 1;
        break;
      default:
        errors += 1;
        break;
    }
  }

  const importableCount = rows.filter((row) =>
    isSalesImportRowImportable(row as ResolvedImportReviewRow),
  ).length;

  return {
    total: rows.length,
    ready,
    needsAttention,
    errors,
    importableCount,
  };
}

export function partitionImportReviewRows(rows: readonly ImportReviewRowViewModel[]): {
  ready: ImportReviewRowViewModel[];
  needsAttention: ImportReviewRowViewModel[];
  errors: ImportReviewRowViewModel[];
} {
  const ready: ImportReviewRowViewModel[] = [];
  const needsAttention: ImportReviewRowViewModel[] = [];
  const errors: ImportReviewRowViewModel[] = [];

  for (const row of rows) {
    const bucket = getImportReviewRowBucket(row);

    switch (bucket) {
      case 'ready':
        ready.push(row);
        break;
      case 'needs-attention':
        needsAttention.push(row);
        break;
      default:
        errors.push(row);
        break;
    }
  }

  return { ready, needsAttention, errors };
}

export function getOwnerFacingAttentionMessage(row: ImportReviewRowViewModel): string | null {
  const resolutionCase = getProductResolutionCase(row);
  const productDisplay = getReviewProductMatchDisplay(row);

  switch (resolutionCase) {
    case PRODUCT_RESOLUTION_CASE.FUZZY_MATCH:
      return `BakeryOS suggests: ${productDisplay.value}`;
    case PRODUCT_RESOLUTION_CASE.MULTIPLE_MATCHES:
      return 'More than one product could match this sale.';
    case PRODUCT_RESOLUTION_CASE.UNKNOWN_PRODUCT:
      return 'Product not found in BakeryOS.';
    case PRODUCT_RESOLUTION_CASE.INACTIVE_PRODUCT:
      return 'The matched product is inactive.';
    default:
      return null;
  }
}

export function getOwnerFacingErrorMessage(row: ImportReviewRowViewModel): string {
  if (row.productResolution?.action === 'skip-row') {
    return 'This sale was skipped and will not be imported.';
  }

  if (isReadOnlyProductResolution(row)) {
    return 'Fix duplicate product data in BakeryOS before importing this sale.';
  }

  const resolutionCase = getProductResolutionCase(row);

  if (resolutionCase === PRODUCT_RESOLUTION_CASE.UNKNOWN_PRODUCT) {
    return 'Product not found in BakeryOS.';
  }

  const blocking = row.conflictEngineResult.blockingReason;

  if (blocking) {
    return blocking;
  }

  if (row.conflictEngineResult.status === CONFLICT_ENGINE_STATUS.ERROR) {
    const firstConflict = row.conflictEngineResult.conflicts[0]?.message;

    if (firstConflict) {
      return firstConflict;
    }
  }

  return 'This sale cannot be imported yet.';
}

export function countUnresolvedIssues(summary: ImportReviewSummary): number {
  return summary.needsAttention + summary.errors;
}
