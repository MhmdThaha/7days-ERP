import { describe, expect, it } from 'vitest';

import {
  findNextFreeProductionSequence,
  formatProductionNumber,
  parseProductionNumberSequence,
} from '@/lib/domain/production-number';

describe('formatProductionNumber', () => {
  it('preserves PRD-001 style padding', () => {
    expect(formatProductionNumber(1)).toBe('PRD-001');
    expect(formatProductionNumber(13)).toBe('PRD-013');
    expect(formatProductionNumber(14)).toBe('PRD-014');
    expect(formatProductionNumber(100)).toBe('PRD-100');
    expect(formatProductionNumber(1000)).toBe('PRD-1000');
  });
});

describe('parseProductionNumberSequence', () => {
  it('parses PRD-### values', () => {
    expect(parseProductionNumberSequence('PRD-001')).toBe(1);
    expect(parseProductionNumberSequence('prd-013')).toBe(13);
    expect(parseProductionNumberSequence(' PRD-014 ')).toBe(14);
  });

  it('returns null for non-matching values', () => {
    expect(parseProductionNumberSequence('PUR-001')).toBeNull();
    expect(parseProductionNumberSequence('PRD')).toBeNull();
    expect(parseProductionNumberSequence('')).toBeNull();
  });
});

describe('findNextFreeProductionSequence', () => {
  it('allocates first number when counter starts at 0', () => {
    expect(findNextFreeProductionSequence(0, () => false)).toEqual({
      sequence: 1,
      productionNumber: 'PRD-001',
    });
  });

  it('continues after existing history (PRD-001…PRD-013 → PRD-014)', () => {
    expect(findNextFreeProductionSequence(13, () => false)).toEqual({
      sequence: 14,
      productionNumber: 'PRD-014',
    });
  });

  it('skips reserved sequences (soft-delete lock gaps)', () => {
    const reserved = new Set([14, 15]);
    expect(findNextFreeProductionSequence(13, (n) => reserved.has(n))).toEqual({
      sequence: 16,
      productionNumber: 'PRD-016',
    });
  });

  it('throws when no free sequence is found within the attempt limit', () => {
    expect(() => findNextFreeProductionSequence(0, () => true, 3)).toThrow(
      /Unable to allocate production number/,
    );
  });
});
