/**
 * UOM boundary tests — purchase/recipe normalize to canonical before inventory math.
 */

import { describe, expect, it } from 'vitest';

import {
  derivePurchaseQuantity,
  derivePurchaseUnitCost,
} from '@/lib/domain/calculations/purchase-pricing';
import { scaleIngredientQuantity } from '@/lib/domain/calculations/production-materials';
import { DomainError } from '@/lib/domain/errors';
import {
  convertQuantity,
  convertToCanonicalQuantity,
} from '@/lib/domain/units/uom-conversion';

describe('Purchase conversion boundary', () => {
  it('converts pack size to material stock unit before derive helpers', () => {
    // Maida stock unit = kg; user enters 500 g pack size, 1 pack @ ₹100
    const canonicalPackSize = convertToCanonicalQuantity(500, 'g', 'kg');
    expect(canonicalPackSize).toBe(0.5);

    const quantity = derivePurchaseQuantity(1, canonicalPackSize);
    const unitCost = derivePurchaseUnitCost(10_000, canonicalPackSize);

    expect(quantity).toBe(0.5);
    expect(unitCost).toBe(20_000); // ₹100 / 0.5 kg = ₹200/kg = 20000 paise
  });

  it('keeps inventory quantity in a single canonical unit (no duplicate stock)', () => {
    const enteredAsGrams = convertToCanonicalQuantity(5000, 'g', 'kg');
    const enteredAsKg = convertToCanonicalQuantity(5, 'kg', 'kg');

    expect(enteredAsGrams).toBe(enteredAsKg);
    expect(derivePurchaseQuantity(1, enteredAsGrams)).toBe(5);
  });
});

describe('Recipe conversion boundary', () => {
  it('stores recipe ingredient in material canonical unit', () => {
    // UI shows 1000 g; material unit is kg → persist 1 kg
    const canonical = convertToCanonicalQuantity(1000, 'g', 'kg');
    expect(canonical).toBe(1);
  });

  it('rejects cross-family recipe entry', () => {
    expect(() => convertToCanonicalQuantity(1, 'L', 'kg')).toThrow(DomainError);
  });
});

describe('Production calculation using converted quantity', () => {
  it('scales canonical recipe qty; display unit does not change underlying need', () => {
    const recipeCanonicalKg = convertToCanonicalQuantity(1000, 'g', 'kg'); // 1 kg
    const batches = 50;
    const requiredCanonical = scaleIngredientQuantity(recipeCanonicalKg, batches, 1);

    expect(requiredCanonical).toBe(50);

    // Display-only conversion for UX
    expect(convertQuantity(requiredCanonical, 'kg', 'g')).toBe(50_000);
    // Underlying production/inventory quantity remains 50 kg
    expect(requiredCanonical).toBe(50);
  });
});

describe('Inventory receives canonical quantity', () => {
  it('purchase and recipe paths agree on stored unit amount', () => {
    const purchaseQty = derivePurchaseQuantity(
      1,
      convertToCanonicalQuantity(500, 'g', 'kg'),
    );
    const recipeQty = convertToCanonicalQuantity(500, 'g', 'kg');

    expect(purchaseQty).toBe(0.5);
    expect(recipeQty).toBe(0.5);
  });
});

describe('Changing display unit does not change underlying quantity', () => {
  it('round-trips kg ↔ g without drift for production preview amounts', () => {
    const underlying = 5;
    const asGrams = convertQuantity(underlying, 'kg', 'g');
    const backToKg = convertQuantity(asGrams, 'g', 'kg');

    expect(asGrams).toBe(5000);
    expect(backToKg).toBe(underlying);
  });
});
