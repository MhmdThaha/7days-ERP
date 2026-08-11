import { normalizeHeaderLabel } from '@/lib/import/services/header-detection.service';

/** Headers that may mean unit price or line total — require user choice in Mapping Review. */
const AMBIGUOUS_MONEY_HEADER_LABELS = new Set(
  ['Price', 'Value', 'Total', 'Amount'].map((label) => normalizeHeaderLabel(label)),
);

export function isAmbiguousMoneyHeader(header: string): boolean {
  const normalized = normalizeHeaderLabel(header);

  return normalized !== '' && AMBIGUOUS_MONEY_HEADER_LABELS.has(normalized);
}

export function entityHasMoneyColumns(columnFields: ReadonlySet<string>): boolean {
  return columnFields.has('sellingPrice') && columnFields.has('amount');
}
