/**
 * Sales import invoice / sale-number semantics.
 *
 * Imported spreadsheet invoice numbers are stored on Sale.saleNumber when provided.
 * When absent, commit omits saleNumber and saleService.create auto-generates one.
 */

import type { NormalizedValue } from '@/lib/import/engine/types';

export const PREPARATION_INVOICE_WARNING = {
  MISSING_INVOICE_NUMBER: 'MISSING_INVOICE_NUMBER',
} as const;

export const MISSING_INVOICE_NUMBER_WARNING_MESSAGE =
  'Invoice number was not provided by the source file. Duplicate detection may be less reliable.';

export function hasNormalizedSaleNumber(value: NormalizedValue | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/** Trims whitespace; blank values become null so commit can auto-generate a number. */
export function normalizeSaleNumberForImport(value: NormalizedValue | undefined): NormalizedValue {
  if (!hasNormalizedSaleNumber(value)) {
    return null;
  }

  return (value as string).trim();
}

export function formatPreparedInvoiceNumberForReview(
  value: NormalizedValue | undefined,
  provenance?: 'imported' | 'defaulted',
): string {
  if (provenance === 'defaulted') {
    return 'Not provided';
  }

  if (value === null || value === undefined || value === '') {
    return '—';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return String(value);
}
