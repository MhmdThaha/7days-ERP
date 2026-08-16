import { describe, expect, it } from 'vitest';

import { isEligibleProductionProduct } from '@/lib/domain/production/eligible-production-product';
import type { ProductListItem } from '@/types/product';

function product(overrides: Partial<ProductListItem> = {}): ProductListItem {
  return {
    id: 'p-101',
    code: 'CK-101',
    name: 'Chocolate Cake 101',
    category: 'Cake',
    unit: 'pcs',
    sellingPrice: 100,
    description: null,
    isActive: true,
    currentStock: 0,
    activeRecipeId: 'rec-101',
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    updatedAt: new Date('2026-08-16T00:00:00.000Z'),
    ...overrides,
  };
}

describe('isEligibleProductionProduct', () => {
  it('allows an active product whose recipe is beyond the old first-100 page', () => {
    expect(isEligibleProductionProduct(product({ id: 'p-101', activeRecipeId: 'rec-101' }))).toBe(
      true,
    );
  });

  it('rejects products without an active recipe pointer', () => {
    expect(isEligibleProductionProduct(product({ activeRecipeId: null }))).toBe(false);
  });

  it('rejects inactive products even if they have a recipe', () => {
    expect(isEligibleProductionProduct(product({ isActive: false }))).toBe(false);
  });
});
