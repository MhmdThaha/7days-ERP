import { describe, expect, it } from 'vitest';

import {
  findNextFreeSaleSequence,
  formatSaleNumber,
  parseSaleNumberSequence,
} from '@/lib/domain/sale-number';

describe('formatSaleNumber', () => {
  it('preserves SAL-001 style padding', () => {
    expect(formatSaleNumber(1)).toBe('SAL-001');
    expect(formatSaleNumber(13)).toBe('SAL-013');
    expect(formatSaleNumber(14)).toBe('SAL-014');
    expect(formatSaleNumber(100)).toBe('SAL-100');
    expect(formatSaleNumber(101)).toBe('SAL-101');
    expect(formatSaleNumber(1000)).toBe('SAL-1000');
  });
});

describe('parseSaleNumberSequence', () => {
  it('parses SAL-### values', () => {
    expect(parseSaleNumberSequence('SAL-001')).toBe(1);
    expect(parseSaleNumberSequence('sal-013')).toBe(13);
    expect(parseSaleNumberSequence(' SAL-014 ')).toBe(14);
  });

  it('returns null for non-matching values (including imported invoice numbers)', () => {
    expect(parseSaleNumberSequence('PRD-001')).toBeNull();
    expect(parseSaleNumberSequence('INV-1234')).toBeNull();
    expect(parseSaleNumberSequence('SAL')).toBeNull();
    expect(parseSaleNumberSequence('')).toBeNull();
  });
});

describe('findNextFreeSaleSequence', () => {
  it('allocates first number when counter starts at 0', () => {
    expect(findNextFreeSaleSequence(0, () => false)).toEqual({
      sequence: 1,
      saleNumber: 'SAL-001',
    });
  });

  it('continues after existing history (SAL-001…SAL-013 → SAL-014)', () => {
    expect(findNextFreeSaleSequence(13, () => false)).toEqual({
      sequence: 14,
      saleNumber: 'SAL-014',
    });
  });

  it('skips reserved sequences (soft-delete lock gaps)', () => {
    const reserved = new Set([14, 15]);
    expect(findNextFreeSaleSequence(13, (n) => reserved.has(n))).toEqual({
      sequence: 16,
      saleNumber: 'SAL-016',
    });
  });

  it('throws when no free sequence is found within the attempt limit', () => {
    expect(() => findNextFreeSaleSequence(0, () => true, 3)).toThrow(
      /Unable to allocate sale number/,
    );
  });
});
