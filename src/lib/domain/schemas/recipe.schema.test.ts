import { describe, expect, it } from 'vitest';

import { createRecipeSchema, updateRecipeSchema } from '@/lib/domain/schemas/recipe.schema';

const validRecipe = {
  productId: 'product-1',
  recipeName: 'Milk Bread',
  batchOutputQuantity: 10,
  targetWeightGrams: null,
  ingredients: [{ rawMaterialId: 'rm-flour', quantity: 2, unit: 'kg' }],
  notes: null,
  isActive: true,
};

describe('recipe Makes (batchOutputQuantity) validation', () => {
  it('rejects blank Makes', () => {
    const { batchOutputQuantity: _omitted, ...withoutMakes } = validRecipe;
    const result = createRecipeSchema.safeParse(withoutMakes);

    expect(result.success).toBe(false);
  });

  it('rejects null Makes', () => {
    const result = createRecipeSchema.safeParse({
      ...validRecipe,
      batchOutputQuantity: null,
    });

    expect(result.success).toBe(false);
  });

  it('rejects zero Makes', () => {
    const result = createRecipeSchema.safeParse({
      ...validRecipe,
      batchOutputQuantity: 0,
    });

    expect(result.success).toBe(false);
  });

  it('rejects negative Makes', () => {
    const result = createRecipeSchema.safeParse({
      ...validRecipe,
      batchOutputQuantity: -5,
    });

    expect(result.success).toBe(false);
  });

  it('accepts positive integer Makes', () => {
    const result = createRecipeSchema.safeParse({
      ...validRecipe,
      batchOutputQuantity: 10,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.batchOutputQuantity).toBe(10);
    }
  });

  it('accepts positive decimal Makes', () => {
    const result = createRecipeSchema.safeParse({
      ...validRecipe,
      batchOutputQuantity: 0.5,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.batchOutputQuantity).toBe(0.5);
    }
  });

  it('rejects null Makes on update when the field is sent', () => {
    const result = updateRecipeSchema.safeParse({
      batchOutputQuantity: null,
    });

    expect(result.success).toBe(false);
  });
});
