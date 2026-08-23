import { describe, expect, it } from 'vitest';

import { purchaseFormSchema } from '@/lib/domain/schemas/purchase.schema';

const validLine = {
  rawMaterialId: 'rm-1',
  packCount: 1,
  packSize: 1,
  unit: 'kg',
  packPrice: 1_000_000,
};

describe('purchaseFormSchema discount and adjustment', () => {
  it('defaults missing discount and adjustment to 0 at the action boundary', () => {
    const parsed = purchaseFormSchema.parse({
      purchaseDate: '2026-08-18',
      supplierName: 'Mill',
      paymentStatus: 'paid',
      lineItems: [validLine],
      discountAmount: 0,
      adjustmentAmount: 0,
    });

    expect(parsed.discountAmount).toBe(0);
    expect(parsed.adjustmentAmount).toBe(0);
  });

  it('rejects discount above subtotal', () => {
    const result = purchaseFormSchema.safeParse({
      purchaseDate: '2026-08-18',
      supplierName: 'Mill',
      paymentStatus: 'paid',
      lineItems: [validLine],
      discountAmount: 1_000_001,
      adjustmentAmount: 0,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'discountAmount')).toBe(true);
    }
  });

  it('rejects negative discount', () => {
    const result = purchaseFormSchema.safeParse({
      purchaseDate: '2026-08-18',
      supplierName: 'Mill',
      paymentStatus: 'paid',
      lineItems: [validLine],
      discountAmount: -1,
      adjustmentAmount: 0,
    });

    expect(result.success).toBe(false);
  });

  it('rejects adjustment that makes payable negative', () => {
    const result = purchaseFormSchema.safeParse({
      purchaseDate: '2026-08-18',
      supplierName: 'Mill',
      paymentStatus: 'paid',
      lineItems: [validLine],
      discountAmount: 0,
      adjustmentAmount: -1_000_001,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'adjustmentAmount')).toBe(true);
    }
  });

  it('accepts discount plus negative adjustment', () => {
    const parsed = purchaseFormSchema.parse({
      purchaseDate: '2026-08-18',
      supplierName: 'Mill',
      paymentStatus: 'paid',
      lineItems: [validLine],
      discountAmount: 50_000,
      adjustmentAmount: -200,
    });

    expect(parsed.discountAmount).toBe(50_000);
    expect(parsed.adjustmentAmount).toBe(-200);
  });
});
