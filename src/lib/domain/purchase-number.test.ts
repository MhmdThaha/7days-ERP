import { describe, expect, it } from 'vitest';

import {
  findNextFreePurchaseSequence,
  formatPurchaseNumber,
  parsePurchaseNumberSequence,
} from '@/lib/domain/purchase-number';

describe('formatPurchaseNumber', () => {
  it('preserves PUR-001 style padding', () => {
    expect(formatPurchaseNumber(1)).toBe('PUR-001');
    expect(formatPurchaseNumber(13)).toBe('PUR-013');
    expect(formatPurchaseNumber(14)).toBe('PUR-014');
    expect(formatPurchaseNumber(100)).toBe('PUR-100');
    expect(formatPurchaseNumber(1000)).toBe('PUR-1000');
  });
});

describe('parsePurchaseNumberSequence', () => {
  it('parses PUR-### values', () => {
    expect(parsePurchaseNumberSequence('PUR-001')).toBe(1);
    expect(parsePurchaseNumberSequence('pur-013')).toBe(13);
    expect(parsePurchaseNumberSequence(' PUR-014 ')).toBe(14);
  });

  it('returns null for non-matching values', () => {
    expect(parsePurchaseNumberSequence('SAL-001')).toBeNull();
    expect(parsePurchaseNumberSequence('PUR')).toBeNull();
    expect(parsePurchaseNumberSequence('')).toBeNull();
  });
});

describe('findNextFreePurchaseSequence', () => {
  it('allocates first number when counter starts at 0', () => {
    expect(findNextFreePurchaseSequence(0, () => false)).toEqual({
      sequence: 1,
      purchaseNumber: 'PUR-001',
    });
  });

  it('continues after existing history (PUR-001…PUR-013 → PUR-014)', () => {
    expect(findNextFreePurchaseSequence(13, () => false)).toEqual({
      sequence: 14,
      purchaseNumber: 'PUR-014',
    });
  });

  it('skips reserved sequences (soft-delete lock gaps)', () => {
    const reserved = new Set([14, 15]);
    expect(findNextFreePurchaseSequence(13, (n) => reserved.has(n))).toEqual({
      sequence: 16,
      purchaseNumber: 'PUR-016',
    });
  });

  it('throws when no free sequence is found within the attempt limit', () => {
    expect(() => findNextFreePurchaseSequence(0, () => true, 3)).toThrow(
      /Unable to allocate purchase number/,
    );
  });
});
