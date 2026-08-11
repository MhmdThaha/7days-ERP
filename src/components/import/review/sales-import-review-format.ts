import { formatPreviewValue } from '@/components/import/preview-format';
import { formatPreparedCustomerNameForReview } from '@/lib/import/preparation/sales-customer-semantics';
import type { ImportReviewRowViewModel } from '@/lib/import/review/types';

function readString(row: ImportReviewRowViewModel, field: string): string {
  const value = row.normalizedValues[field] ?? row.originalValues[field];

  if (value === null || value === undefined || value === '') {
    return '—';
  }

  if (typeof value === 'string') {
    return value.trim() || '—';
  }

  return String(value);
}

export function formatReviewSaleDate(row: ImportReviewRowViewModel): string {
  const value = row.normalizedValues['saleDate'];

  if (value instanceof Date) {
    return formatPreviewValue(value, 'date');
  }

  if (typeof value === 'string' && value.trim()) {
    const [year, month, day] = value.split('-').map(Number);

    if (year && month && day) {
      return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });
    }
  }

  return '—';
}

export function formatReviewCustomer(row: ImportReviewRowViewModel): string {
  return formatPreparedCustomerNameForReview(
    row.normalizedValues['customerName'],
    row.preparedFieldSources?.customerName === 'defaulted' ? 'defaulted' : undefined,
  );
}

export function formatReviewQuantityAmount(row: ImportReviewRowViewModel): string {
  const quantity = row.normalizedValues['quantity'];
  const amount = row.normalizedValues['amount'];
  const sellingPrice = row.normalizedValues['sellingPrice'];

  const qtyText =
    typeof quantity === 'number'
      ? quantity.toLocaleString('en-IN')
      : readString(row, 'quantity');

  if (typeof amount === 'number' && amount > 0 && typeof quantity === 'number' && quantity > 0) {
    const unit = Math.round(amount / quantity);
    return `${qtyText} × ₹${unit.toLocaleString('en-IN')}`;
  }

  if (typeof sellingPrice === 'number') {
    return `${qtyText} × ₹${sellingPrice.toLocaleString('en-IN')}`;
  }

  if (typeof amount === 'number') {
    return `${qtyText} · ₹${amount.toLocaleString('en-IN')}`;
  }

  return qtyText;
}

export function formatReviewProductName(row: ImportReviewRowViewModel): string {
  return readString(row, 'productName');
}
