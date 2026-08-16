import { describe, expect, it } from 'vitest';

import { convertQuantity } from '@/lib/domain/units/uom-conversion';
import {
  chooseReadableDisplayUnit,
  formatProductionQuantityDisplay,
} from '@/lib/utils/production-quantity-display';

describe('formatProductionQuantityDisplay', () => {
  it('shows at most two decimals and drops trailing zeros', () => {
    expect(formatProductionQuantityDisplay(23.3333)).toBe('23.33');
    expect(formatProductionQuantityDisplay(23.3)).toBe('23.3');
    expect(formatProductionQuantityDisplay(23)).toBe('23');
    expect(formatProductionQuantityDisplay(0.375)).toBe('0.38');
    expect(formatProductionQuantityDisplay(10.5)).toBe('10.5');
  });

  it('does not modify the underlying numeric value', () => {
    const stored = 23.3333;
    formatProductionQuantityDisplay(stored);
    expect(stored).toBe(23.3333);
  });
});

describe('chooseReadableDisplayUnit', () => {
  it('shows gram-scale weights in g instead of kg', () => {
    expect(chooseReadableDisplayUnit(0.25, 'kg')).toBe('g');
    expect(convertQuantity(0.25, 'kg', 'g')).toBe(250);
  });

  it('keeps kilogram-scale weights in kg', () => {
    expect(chooseReadableDisplayUnit(2.5, 'kg')).toBe('kg');
  });

  it('shows millilitre-scale volumes in ml instead of L', () => {
    expect(chooseReadableDisplayUnit(0.25, 'L')).toBe('ml');
    expect(convertQuantity(0.25, 'L', 'ml')).toBe(250);
  });

  it('keeps litre-scale volumes in L', () => {
    expect(chooseReadableDisplayUnit(2.5, 'L')).toBe('L');
  });

  it('keeps gram and millilitre canonical units when already readable', () => {
    expect(chooseReadableDisplayUnit(250, 'g')).toBe('g');
    expect(chooseReadableDisplayUnit(250, 'ml')).toBe('ml');
  });

  it('does not change the canonical quantity', () => {
    const storedKg = 0.25;
    chooseReadableDisplayUnit(storedKg, 'kg');
    expect(storedKg).toBe(0.25);
  });
});
