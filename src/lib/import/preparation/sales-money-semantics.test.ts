import { describe, expect, it } from 'vitest';

import {
  calculateLineTotalMajor,
  deriveUnitPriceMajor,
  moneyValuesConsistent,
} from '@/lib/import/preparation/sales-money-semantics';

describe('sales-money-semantics', () => {
  it('derives unit price from historical line total without inflation', () => {
    expect(deriveUnitPriceMajor(4500, 100)).toBe(45);
    expect(calculateLineTotalMajor(100, 45)).toBe(4500);
  });

  it('validates consistency within 1 paisa', () => {
    expect(moneyValuesConsistent(100, 45, 4500)).toBe(true);
    expect(moneyValuesConsistent(100, 45, 5000)).toBe(false);
  });
});
