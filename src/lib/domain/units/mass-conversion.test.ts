import { describe, expect, it } from 'vitest';

import {
  convertQuantityToKg,
  isConvertibleToKg,
  sumQuantitiesAsKg,
} from '@/lib/domain/units/mass-conversion';

describe('convertQuantityToKg', () => {
  it('converts mass units to kg', () => {
    expect(convertQuantityToKg(1, 'kg')).toBe(1);
    expect(convertQuantityToKg(0.25, 'kg')).toBe(0.25);
    expect(convertQuantityToKg(15, 'g')).toBe(0.015);
    expect(convertQuantityToKg(500, 'mg')).toBe(0.0005);
  });

  it('converts volume units using default liquid density', () => {
    expect(convertQuantityToKg(0.5, 'L')).toBe(0.5);
    expect(convertQuantityToKg(5, 'ml')).toBe(0.005);
  });

  it('returns null for non-mass units', () => {
    expect(convertQuantityToKg(10, 'piece')).toBeNull();
    expect(convertQuantityToKg(1, 'dozen')).toBeNull();
  });
});

describe('isConvertibleToKg', () => {
  it('recognizes supported units case-insensitively', () => {
    expect(isConvertibleToKg('KG')).toBe(true);
    expect(isConvertibleToKg('Grams')).toBe(true);
    expect(isConvertibleToKg('ML')).toBe(true);
    expect(isConvertibleToKg('bag')).toBe(false);
  });
});

describe('sumQuantitiesAsKg', () => {
  it('matches standard bread dough batch theoretical weight', () => {
    const total = sumQuantitiesAsKg([
      { quantity: 1, unit: 'kg' },
      { quantity: 0.25, unit: 'kg' },
      { quantity: 0.01, unit: 'kg' },
      { quantity: 15, unit: 'g' },
      { quantity: 0.005, unit: 'kg' },
      { quantity: 0.003, unit: 'kg' },
      { quantity: 5, unit: 'ml' },
      { quantity: 0.05, unit: 'kg' },
      { quantity: 0.5, unit: 'L' },
    ]);

    expect(total).toBeCloseTo(1.838, 6);
  });

  it('does not reproduce naive sum bug (21.318)', () => {
    const naiveSum = 1 + 0.25 + 0.01 + 15 + 0.005 + 0.003 + 5 + 0.05;
    expect(naiveSum).toBeCloseTo(21.318, 6);

    const converted = sumQuantitiesAsKg([
      { quantity: 1, unit: 'kg' },
      { quantity: 0.25, unit: 'kg' },
      { quantity: 0.01, unit: 'kg' },
      { quantity: 15, unit: 'g' },
      { quantity: 0.005, unit: 'kg' },
      { quantity: 0.003, unit: 'kg' },
      { quantity: 5, unit: 'ml' },
      { quantity: 0.05, unit: 'kg' },
    ]);

    expect(converted).toBeCloseTo(1.338, 6);
    expect(converted).not.toBeCloseTo(naiveSum, 3);
  });

  it('skips count-based units when summing batch weight', () => {
    const total = sumQuantitiesAsKg([
      { quantity: 1, unit: 'kg' },
      { quantity: 12, unit: 'piece' },
    ]);

    expect(total).toBe(1);
  });
});
