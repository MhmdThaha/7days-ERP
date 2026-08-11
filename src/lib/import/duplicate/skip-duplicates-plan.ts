/**
 * Plans which importable rows are skipped vs imported under SKIP_DUPLICATES.
 * Client-safe — no Firestore / server-only imports.
 */

import {
  buildDuplicateImportRowFingerprint,
} from '@/lib/import/duplicate/duplicate-import.service';
import {
  DUPLICATE_IMPORT_RECOMMENDATION,
  type DuplicateImportResult,
} from '@/lib/import/duplicate/duplicate-import.types';
import { isSalesImportRowImportable } from '@/lib/import/execution/sales-import-importability';
import type { ResolvedImportReviewRow } from '@/lib/import/resolution/types';

export type SkipDuplicatesPlan = {
  duplicateSalesCount: number;
  newSalesCount: number;
};

/** Counts importable rows that will be skipped vs imported when SKIP_DUPLICATES is enforced. */
export function planSkipDuplicates(
  rows: readonly ResolvedImportReviewRow[],
  duplicateResult: DuplicateImportResult,
): SkipDuplicatesPlan {
  if (duplicateResult.recommendation !== DUPLICATE_IMPORT_RECOMMENDATION.SKIP_DUPLICATES) {
    return { duplicateSalesCount: 0, newSalesCount: 0 };
  }

  const duplicateFingerprints = new Set(duplicateResult.duplicateRowFingerprints);
  let duplicateSalesCount = 0;
  let newSalesCount = 0;

  for (const row of rows) {
    if (!isSalesImportRowImportable(row)) {
      continue;
    }

    const fingerprint = buildDuplicateImportRowFingerprint(row);

    if (fingerprint !== '' && duplicateFingerprints.has(fingerprint)) {
      duplicateSalesCount += 1;
    } else {
      newSalesCount += 1;
    }
  }

  return { duplicateSalesCount, newSalesCount };
}
