/**
 * Sales import row importability — shared by execution and review UI.
 * No Firestore / server-only imports.
 */

import type { ResolvedImportReviewRow } from '@/lib/import/resolution/types';
import { CONFLICT_ENGINE_STATUS } from '@/lib/import/services/conflict-engine.service';
import { PRODUCT_MATCH_STATUS } from '@/lib/import/services/product-matching.service';

export function isSalesImportRowImportable(row: ResolvedImportReviewRow): boolean {
  if (row.productResolution?.action === 'skip-row') {
    return false;
  }

  if (row.productResolution?.action === 'create-placeholder') {
    return false;
  }

  if (row.conflictEngineResult.status === CONFLICT_ENGINE_STATUS.ERROR) {
    return false;
  }

  const match = row.productMatchResult;

  if (!match?.matchedProductId) {
    return false;
  }

  if (
    match.status === PRODUCT_MATCH_STATUS.NOT_FOUND ||
    match.status === PRODUCT_MATCH_STATUS.MULTIPLE_MATCHES ||
    match.status === PRODUCT_MATCH_STATUS.SYSTEM_CONFIGURATION_ERROR
  ) {
    return false;
  }

  if (match.status === PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION) {
    return (
      row.productResolution?.action === 'accept-inactive' ||
      row.productResolution?.action === 'select-existing'
    );
  }

  return (
    row.conflictEngineResult.status === CONFLICT_ENGINE_STATUS.READY ||
    row.conflictEngineResult.status === CONFLICT_ENGINE_STATUS.WARNING
  );
}

export function reviewRowSkipReason(row: ResolvedImportReviewRow): string | null {
  if (row.productResolution?.action === 'skip-row') {
    return 'Row skipped during product resolution.';
  }

  if (row.productResolution?.action === 'create-placeholder') {
    return 'Placeholder product — not imported in Phase 10A.';
  }

  if (row.conflictEngineResult.status === CONFLICT_ENGINE_STATUS.ERROR) {
    return row.conflictEngineResult.blockingReason ?? 'Row has blocking errors.';
  }

  if (!row.productMatchResult?.matchedProductId) {
    return 'Product is not resolved to a catalog item.';
  }

  if (!isSalesImportRowImportable(row)) {
    return 'Row is not eligible for import.';
  }

  return null;
}
