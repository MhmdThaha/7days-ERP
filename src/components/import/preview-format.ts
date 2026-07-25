/**
 * Display-only formatting for the import preview. Pure presentation: the
 * values themselves come from the engine untouched.
 */

import type { FieldDataType, NormalizedValue } from '@/lib/import/engine/types';

const INR_MAJOR_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const NUMBER_FORMATTER = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 3,
});

const DATE_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/** Formats one normalized engine value for display in the preview. */
export function formatPreviewValue(
  value: NormalizedValue | undefined,
  dataType: FieldDataType | undefined,
): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  if (value instanceof Date) {
    return DATE_FORMATTER.format(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'number') {
    // Engine money values are in rupees (major units).
    if (dataType === 'money') {
      return INR_MAJOR_FORMATTER.format(value);
    }

    if (dataType === 'percent') {
      return `${NUMBER_FORMATTER.format(value)}%`;
    }

    return NUMBER_FORMATTER.format(value);
  }

  return value;
}
