/**
 * Duplicate import review — client-safe presentation for row-level user decisions.
 *
 * Uses existing duplicate detection output only. Does not re-run detection.
 */

import {
  buildDuplicateImportRowFingerprint,
} from '@/lib/import/duplicate/duplicate-import.service';
import {
  DUPLICATE_IMPORT_RECOMMENDATION,
  DUPLICATE_IMPORT_STATUS,
  shouldResumeBlockedDuplicateImport,
  type DuplicateImportResult,
} from '@/lib/import/duplicate/duplicate-import.types';
import { isSalesImportRowImportable } from '@/lib/import/execution/sales-import-importability';
import type { NormalizedValue } from '@/lib/import/engine/types';
import type { ResolvedImportReviewRow } from '@/lib/import/resolution/types';

export type DuplicateImportReviewMatchKind = 'invoice' | 'similar-sale';

export type DuplicateImportReviewItem = {
  /** Stable spreadsheet row number from the import review. */
  rowNumber: number;
  rowFingerprint: string;
  /** Human-readable row summary for the review list. */
  label: string;
  warningMessage: string;
  matchKind: DuplicateImportReviewMatchKind;
};

export type DuplicateImportReviewResult = {
  items: readonly DuplicateImportReviewItem[];
  flaggedCount: number;
  nonFlaggedImportableCount: number;
  duplicateResult: DuplicateImportResult;
};

export type DuplicateImportWarningKind = 'exact-file' | 'similar-sales' | 'invoice-match';

/** One friendly warning shown before import when duplicates may exist. */
export type DuplicateImportWarning = {
  duplicateResult: DuplicateImportResult;
  title: string;
  message: string;
  kind: DuplicateImportWarningKind;
};

export function formatShortSaleDate(value: NormalizedValue | undefined): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date) {
    return value.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed === '') {
      return null;
    }

    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);

    if (iso) {
      const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

      return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    }

    const dayFirst = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(trimmed);

    if (dayFirst) {
      const date = new Date(Number(dayFirst[3]), Number(dayFirst[2]) - 1, Number(dayFirst[1]));

      return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    }
  }

  return String(value);
}

function displayText(value: NormalizedValue | undefined): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed === '' ? null : trimmed;
}

function normalizeInvoiceDisplay(value: NormalizedValue | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim().toUpperCase();

  return trimmed === '' ? null : trimmed;
}

/** Friendly one-line label: invoice (optional) • customer • product • qty • date */
export function formatSaleRowReviewLabel(row: ResolvedImportReviewRow): string {
  const values = row.normalizedValues;
  const invoice = normalizeInvoiceDisplay(values['saleNumber']);
  const customer = displayText(values['customerName']);
  const product =
    row.productMatchResult?.matchedProductName ??
    displayText(values['productName']) ??
    displayText(values['productCode']);
  const quantity = displayText(values['quantity']);
  const date = formatShortSaleDate(values['saleDate']);

  const detail = [customer, product, quantity, date].filter((part): part is string => Boolean(part));

  if (invoice && detail.length > 0) {
    return `${invoice} • ${detail.join(' • ')}`;
  }

  if (invoice) {
    return invoice;
  }

  return detail.join(' • ') || `Row ${row.rowNumber}`;
}

function resolveWarningMessage(
  row: ResolvedImportReviewRow,
  duplicateResult: DuplicateImportResult,
): { message: string; matchKind: DuplicateImportReviewMatchKind } {
  const invoice = normalizeInvoiceDisplay(row.normalizedValues['saleNumber']);
  const matchedInvoices = new Set(
    duplicateResult.matchedInvoices.map((entry) => entry.trim().toUpperCase()),
  );

  if (invoice && matchedInvoices.has(invoice)) {
    return {
      message: 'Same invoice found',
      matchKind: 'invoice',
    };
  }

  return {
    message: 'Similar sale already exists',
    matchKind: 'similar-sale',
  };
}

/** True when duplicate detection requires a user review step before commit. */
export function duplicateResultNeedsRowReview(duplicateResult: DuplicateImportResult): boolean {
  return (
    duplicateResult.recommendation === DUPLICATE_IMPORT_RECOMMENDATION.REVIEW ||
    duplicateResult.recommendation === DUPLICATE_IMPORT_RECOMMENDATION.SKIP_DUPLICATES
  );
}

/** True when the user must confirm before import (resume paths proceed automatically). */
export function duplicateResultNeedsUserConfirmation(
  duplicateResult: DuplicateImportResult,
): boolean {
  if (shouldResumeBlockedDuplicateImport(duplicateResult)) {
    return false;
  }

  return (
    duplicateResult.recommendation === DUPLICATE_IMPORT_RECOMMENDATION.BLOCK_IMPORT ||
    duplicateResult.recommendation === DUPLICATE_IMPORT_RECOMMENDATION.REVIEW ||
    duplicateResult.recommendation === DUPLICATE_IMPORT_RECOMMENDATION.SKIP_DUPLICATES
  );
}

/** Bakery-friendly warning copy — no technical terms. */
export function buildDuplicateImportWarning(
  duplicateResult: DuplicateImportResult,
): DuplicateImportWarning {
  if (duplicateResult.status === DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE) {
    return {
      duplicateResult,
      kind: 'exact-file',
      title: 'This file was imported before',
      message:
        'This Excel file looks exactly like one you imported earlier. Import again only if you mean to add these sales a second time.',
    };
  }

  if (
    duplicateResult.recommendation === DUPLICATE_IMPORT_RECOMMENDATION.BLOCK_IMPORT &&
    duplicateResult.matchedInvoices.length > 0
  ) {
    const invoiceList = duplicateResult.matchedInvoices.slice(0, 3).join(', ');
    const extra =
      duplicateResult.matchedInvoices.length > 3
        ? ` and ${duplicateResult.matchedInvoices.length - 3} more`
        : '';

    return {
      duplicateResult,
      kind: 'invoice-match',
      title: 'Same invoice number found',
      message: `Invoice ${invoiceList}${extra} was already imported. Import again only if this is a new sale, not a repeat.`,
    };
  }

  const matchedRows = duplicateResult.matchedRows;
  const saleWord = matchedRows === 1 ? 'sale' : 'sales';

  return {
    duplicateResult,
    kind: 'similar-sales',
    title: 'Similar sales found',
    message: `${matchedRows.toLocaleString('en-IN')} ${saleWord} in this file look similar to sales already imported. Import anyway only if these are new sales, not duplicates.`,
  };
}

/** Build per-row review items for rows flagged by the existing duplicate algorithm. */
export function buildDuplicateImportReview(
  rows: readonly ResolvedImportReviewRow[],
  duplicateResult: DuplicateImportResult,
): DuplicateImportReviewResult {
  const duplicateFingerprints = new Set(duplicateResult.duplicateRowFingerprints);
  const items: DuplicateImportReviewItem[] = [];
  let nonFlaggedImportableCount = 0;

  for (const row of rows) {
    if (!isSalesImportRowImportable(row)) {
      continue;
    }

    const fingerprint = buildDuplicateImportRowFingerprint(row);

    if (fingerprint === '' || !duplicateFingerprints.has(fingerprint)) {
      nonFlaggedImportableCount += 1;
      continue;
    }

    const warning = resolveWarningMessage(row, duplicateResult);

    items.push({
      rowNumber: row.rowNumber,
      rowFingerprint: fingerprint,
      label: formatSaleRowReviewLabel(row),
      warningMessage: warning.message,
      matchKind: warning.matchKind,
    });
  }

  items.sort((a, b) => a.rowNumber - b.rowNumber);

  return {
    items,
    flaggedCount: items.length,
    nonFlaggedImportableCount,
    duplicateResult,
  };
}

export function defaultSelectedDuplicateRowNumbers(
  items: readonly DuplicateImportReviewItem[],
): number[] {
  return items.map((item) => item.rowNumber);
}

export function duplicateReviewSkippedRowNumbers(
  items: readonly DuplicateImportReviewItem[],
  selectedRowNumbers: ReadonlySet<number>,
): number[] {
  return items
    .filter((item) => !selectedRowNumbers.has(item.rowNumber))
    .map((item) => item.rowNumber);
}

export function countSelectedDuplicateImports(
  review: DuplicateImportReviewResult,
  selectedRowNumbers: ReadonlySet<number>,
): number {
  return review.items.filter((item) => selectedRowNumbers.has(item.rowNumber)).length;
}
