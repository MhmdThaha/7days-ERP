import { describe, expect, it } from 'vitest';

import {
  calculatePurchaseLineTotal,
  derivePurchaseQuantity,
  derivePurchaseUnitCost,
} from '@/lib/domain/calculations/purchase-pricing';

describe('purchase pack pricing', () => {
  describe('the reported bug: 1 pack of 1000 g at ₹340', () => {
    const packCount = 1;
    const packSize = 1000;
    const packPrice = 34000; // ₹340 in paise

    it('adds exactly 1000 g to inventory', () => {
      expect(derivePurchaseQuantity(packCount, packSize)).toBe(1000);
    });

    it('derives ₹0.34 per gram automatically', () => {
      expect(derivePurchaseUnitCost(packPrice, packSize)).toBe(34);
    });

    it('totals ₹340, not ₹340,000', () => {
      expect(calculatePurchaseLineTotal(packCount, packPrice)).toBe(34000);
    });
  });

  describe('derivePurchaseQuantity', () => {
    it('multiplies packs by pack size', () => {
      expect(derivePurchaseQuantity(2, 500)).toBe(1000);
      expect(derivePurchaseQuantity(50, 1)).toBe(50);
    });

    it('supports fractional packs and sizes, rounded to 3 decimals', () => {
      expect(derivePurchaseQuantity(2.5, 0.4)).toBe(1);
      expect(derivePurchaseQuantity(3, 0.333)).toBe(0.999);
    });

    it('suppresses float noise', () => {
      expect(derivePurchaseQuantity(3, 0.1)).toBe(0.3);
    });
  });

  describe('derivePurchaseUnitCost', () => {
    it('keeps fractional paise exact instead of rounding to integer paise', () => {
      // ₹335 for 1000 g → 33.5 paise per gram
      expect(derivePurchaseUnitCost(33500, 1000)).toBe(33.5);
    });

    it('handles cheap per-gram materials without corruption', () => {
      // ₹32 for 1000 g of flour → 3.2 paise per gram (old integer rule stored 3)
      expect(derivePurchaseUnitCost(3200, 1000)).toBe(3.2);
    });

    it('rounds to 4 decimal places', () => {
      // ₹10 for 3000 g → 0.3333... paise per gram
      expect(derivePurchaseUnitCost(1000, 3000)).toBe(0.3333);
    });

    it('gives whole-paise rates for kg-unit materials', () => {
      // 1 bag of 50 kg maida at ₹1,600 → ₹32/kg
      expect(derivePurchaseUnitCost(160000, 50)).toBe(3200);
    });
  });

  describe('calculatePurchaseLineTotal', () => {
    it('is packs × pack price — the exact money paid', () => {
      expect(calculatePurchaseLineTotal(1, 34000)).toBe(34000);
      expect(calculatePurchaseLineTotal(3, 33500)).toBe(100500);
    });

    it('stays integer paise for fractional pack counts', () => {
      const total = calculatePurchaseLineTotal(2.5, 33333);

      expect(Number.isInteger(total)).toBe(true);
      expect(total).toBe(83333);
    });

    it('never inflates the total the way qty × unit-cost entry did', () => {
      // The old bug: 1000 (g) × ₹340 = ₹340,000. Pack entry cannot produce it.
      expect(calculatePurchaseLineTotal(1, 34000)).not.toBe(34000000);
    });
  });

  describe('derived fields stay mutually consistent', () => {
    it('lineTotal ≈ quantity × unitCost within rounding tolerance', () => {
      const cases = [
        { packCount: 1, packSize: 1000, packPrice: 34000 },
        { packCount: 2, packSize: 500, packPrice: 17500 },
        { packCount: 1, packSize: 50, packPrice: 160000 },
        { packCount: 3, packSize: 250, packPrice: 9999 },
      ];

      for (const { packCount, packSize, packPrice } of cases) {
        const quantity = derivePurchaseQuantity(packCount, packSize);
        const unitCost = derivePurchaseUnitCost(packPrice, packSize);
        const lineTotal = calculatePurchaseLineTotal(packCount, packPrice);

        // Rate is rounded to 4dp so reconstruction may differ by a few paise,
        // but the stored lineTotal is always the exact money paid.
        expect(Math.abs(quantity * unitCost - lineTotal)).toBeLessThan(1);
      }
    });
  });
});
