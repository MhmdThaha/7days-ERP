import { describe, expect, it } from 'vitest';

import {
  formatPreparedCustomerNameForReview,
  normalizeCustomerNameForSale,
  WALK_IN_CUSTOMER_DISPLAY_LABEL,
} from '@/lib/import/preparation/sales-customer-semantics';

describe('sales-customer-semantics', () => {
  it('normalizes missing customer to null for manual walk-in parity', () => {
    expect(normalizeCustomerNameForSale(null)).toBeNull();
    expect(normalizeCustomerNameForSale('')).toBeNull();
    expect(normalizeCustomerNameForSale('   ')).toBeNull();
  });

  it('trims imported customer names', () => {
    expect(normalizeCustomerNameForSale('  Kabeer Bakery  ')).toBe('Kabeer Bakery');
  });

  it('formats defaulted customer as Walk-in in review', () => {
    expect(formatPreparedCustomerNameForReview(null, 'defaulted')).toBe(WALK_IN_CUSTOMER_DISPLAY_LABEL);
    expect(formatPreparedCustomerNameForReview('Kabeer Bakery', 'imported')).toBe('Kabeer Bakery');
  });
});
