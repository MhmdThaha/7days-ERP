/**
 * Sales import customer semantics — aligns with manual sale walk-in behavior.
 *
 * Manual sales store no customer as customerNameSnapshot: null.
 * UI displays the label "Walk-in" — never persisted as a customer record.
 */

import type { NormalizedValue } from '@/lib/import/engine/types';

/** Display label used across manual sale UI when no customer is stored. */
export const WALK_IN_CUSTOMER_DISPLAY_LABEL = 'Walk-in';

export function hasNormalizedCustomerName(value: NormalizedValue | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/** Normalizes to trimmed string or null — matches saleService.create input. */
export function normalizeCustomerNameForSale(value: NormalizedValue | undefined): NormalizedValue {
  if (!hasNormalizedCustomerName(value)) {
    return null;
  }

  return (value as string).trim();
}

export function formatPreparedCustomerNameForReview(
  value: NormalizedValue | undefined,
  provenance?: 'imported' | 'defaulted',
): string {
  if (provenance === 'defaulted') {
    return WALK_IN_CUSTOMER_DISPLAY_LABEL;
  }

  if (value === null || value === undefined || value === '') {
    return '—';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return String(value);
}
