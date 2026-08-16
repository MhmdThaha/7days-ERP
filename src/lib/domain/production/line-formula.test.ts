import { describe, expect, it } from 'vitest';

import { resolveProductionLineFormula } from '@/lib/domain/production/line-formula';

const v1 = [{ rawMaterialId: 'rm-maida', rawMaterialName: 'Maida', quantity: 1, unit: 'kg' }];
const v2 = [{ rawMaterialId: 'rm-maida', rawMaterialName: 'Maida', quantity: 2, unit: 'kg' }];

describe('resolveProductionLineFormula', () => {
  it('uses the live recipe when Keep Current was not chosen', () => {
    const formula = resolveProductionLineFormula({
      acceptedStaleRecipe: false,
      snapshotIngredients: v1,
      snapshotBatchOutputQuantity: 10,
      liveIngredients: v2,
      liveBatchOutputQuantity: 10,
    });

    expect(formula.ingredients[0]?.quantity).toBe(2);
    expect(formula.batchOutputQuantity).toBe(10);
  });

  it('uses the draft snapshot when Keep Current was chosen', () => {
    const formula = resolveProductionLineFormula({
      acceptedStaleRecipe: true,
      snapshotIngredients: v1,
      snapshotBatchOutputQuantity: 10,
      liveIngredients: v2,
      liveBatchOutputQuantity: 10,
    });

    expect(formula.ingredients[0]?.quantity).toBe(1);
    expect(formula.batchOutputQuantity).toBe(10);
  });

  it('falls back to the live recipe when Keep Current is set but no snapshot exists', () => {
    const formula = resolveProductionLineFormula({
      acceptedStaleRecipe: true,
      snapshotIngredients: [],
      snapshotBatchOutputQuantity: 10,
      liveIngredients: v2,
      liveBatchOutputQuantity: 10,
    });

    expect(formula.ingredients[0]?.quantity).toBe(2);
  });
});
