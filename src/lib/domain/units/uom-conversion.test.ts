/**
 * Centralized UOM conversion tests — weight/volume families only.
 */

import { describe, expect, it } from 'vitest';

import { DomainError } from '@/lib/domain/errors';
import {
  areUnitsCompatible,
  convertQuantity,
  convertToCanonicalQuantity,
  formatQuantityInUnit,
  getUnitFamily,
  listCompatibleUnits,
} from '@/lib/domain/units/uom-conversion';

describe('convertQuantity', () => {
  it('converts 1 kg → 1000 g', () => {
    expect(convertQuantity(1, 'kg', 'g')).toBe(1000);
  });

  it('converts 1000 g → 1 kg', () => {
    expect(convertQuantity(1000, 'g', 'kg')).toBe(1);
  });

  it('converts 1 g → 1000 mg', () => {
    expect(convertQuantity(1, 'g', 'mg')).toBe(1000);
  });

  it('converts 1000 mg → 1 g', () => {
    expect(convertQuantity(1000, 'mg', 'g')).toBe(1);
  });

  it('converts 1 L → 1000 ml', () => {
    expect(convertQuantity(1, 'L', 'ml')).toBe(1000);
  });

  it('converts 1000 ml → 1 L', () => {
    expect(convertQuantity(1000, 'ml', 'L')).toBe(1);
  });

  it('converts 500 g → 0.5 kg', () => {
    expect(convertQuantity(500, 'g', 'kg')).toBe(0.5);
  });

  it('converts 500 ml → 0.5 L', () => {
    expect(convertQuantity(500, 'ml', 'L')).toBe(0.5);
  });

  it('rejects kg → ml', () => {
    expect(() => convertQuantity(1, 'kg', 'ml')).toThrow(DomainError);
    expect(() => convertQuantity(1, 'kg', 'ml')).toThrow(/same unit family/i);
  });

  it('rejects g → L', () => {
    expect(() => convertQuantity(1, 'g', 'L')).toThrow(DomainError);
  });

  it('accepts unit aliases case-insensitively', () => {
    expect(convertQuantity(1, 'KG', 'Grams')).toBe(1000);
    expect(convertQuantity(1, 'litre', 'ML')).toBe(1000);
  });
});

describe('convertToCanonicalQuantity', () => {
  it('converts purchase/recipe entry into material stock unit', () => {
    expect(convertToCanonicalQuantity(500, 'g', 'kg')).toBe(0.5);
    expect(convertToCanonicalQuantity(1000, 'ml', 'L')).toBe(1);
  });

  it('passes through when entry unit already matches canonical', () => {
    expect(convertToCanonicalQuantity(5, 'kg', 'kg')).toBe(5);
    expect(convertToCanonicalQuantity(12, 'piece', 'piece')).toBe(12);
  });

  it('rejects mismatched non-convertible units', () => {
    expect(() => convertToCanonicalQuantity(1, 'bag', 'kg')).toThrow(DomainError);
  });
});

describe('helpers', () => {
  it('lists compatible units by family', () => {
    expect(listCompatibleUnits('kg')).toEqual(['mg', 'g', 'kg']);
    expect(listCompatibleUnits('ml')).toEqual(['ml', 'L']);
    expect(listCompatibleUnits('piece')).toEqual([]);
  });

  it('detects family compatibility', () => {
    expect(getUnitFamily('g')).toBe('weight');
    expect(getUnitFamily('L')).toBe('volume');
    expect(areUnitsCompatible('kg', 'g')).toBe(true);
    expect(areUnitsCompatible('kg', 'ml')).toBe(false);
  });

  it('formats display without changing underlying quantity semantics', () => {
    expect(formatQuantityInUnit(5, 'kg', 'g')).toContain('g');
    expect(convertQuantity(5, 'kg', 'g')).toBe(5000);
    expect(formatQuantityInUnit(5, 'kg', 'kg')).toContain('kg');
  });
});
