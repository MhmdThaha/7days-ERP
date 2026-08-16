import { describe, expect, it } from 'vitest';

import {
  hasDraftRecipeVersionMismatch,
  recipesFromLineSnapshots,
  shouldPromptRecipeChanged,
} from '@/lib/domain/production/draft-recipe-version';
import type { Production, ProductionLineItem } from '@/types/production';
import type { Recipe } from '@/types/recipe';

function line(overrides: Partial<ProductionLineItem> = {}): ProductionLineItem {
  return {
    id: 'prl-1',
    productId: 'p-1',
    productCode: 'CK-1',
    productName: 'Cake',
    quantity: 10,
    unit: 'pcs',
    recipeId: 'rec-1',
    recipeCode: 'R-1',
    recipeName: 'Cake Recipe',
    recipeVersion: 1,
    recipeBatchOutputQuantity: 10,
    recipeIngredients: [
      { rawMaterialId: 'rm-maida', rawMaterialName: 'Maida', quantity: 1, unit: 'kg' },
    ],
    ...overrides,
  };
}

function production(overrides: Partial<Production> = {}): Production {
  return {
    id: 'prd-1',
    organizationId: 'org-a',
    productionNumber: 'PRD-001',
    productionDate: '2026-08-16',
    status: 'draft',
    lines: [line()],
    totalUnits: 10,
    lineCount: 1,
    notes: null,
    acceptedStaleRecipe: false,
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    createdBy: 'user-1',
    updatedAt: new Date('2026-08-16T00:00:00.000Z'),
    updatedBy: 'user-1',
    completedAt: null,
    completedBy: null,
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'rec-1',
    organizationId: 'org-a',
    productId: 'p-1',
    recipeCode: 'R-1',
    recipeName: 'Cake Recipe',
    version: 2,
    batchOutputQuantity: 10,
    targetWeightGrams: null,
    ingredients: [
      { rawMaterialId: 'rm-maida', rawMaterialName: 'Maida', quantity: 2, unit: 'kg' },
    ],
    totalWeight: 2,
    notes: null,
    isActive: true,
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    createdBy: 'user-1',
    updatedAt: new Date('2026-08-16T00:00:00.000Z'),
    updatedBy: 'user-1',
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

describe('draft recipe version mismatch', () => {
  it('detects live recipe version ahead of the draft line', () => {
    const recipesById = new Map([['rec-1', recipe({ version: 2 })]]);

    expect(hasDraftRecipeVersionMismatch(production(), recipesById)).toBe(true);
    expect(shouldPromptRecipeChanged(production(), recipesById)).toBe(true);
  });

  it('does not prompt after Keep Current is persisted', () => {
    const recipesById = new Map([['rec-1', recipe({ version: 2 })]]);

    expect(
      shouldPromptRecipeChanged(production({ acceptedStaleRecipe: true }), recipesById),
    ).toBe(false);
  });

  it('does not prompt when versions match', () => {
    const recipesById = new Map([['rec-1', recipe({ version: 1 })]]);

    expect(shouldPromptRecipeChanged(production(), recipesById)).toBe(false);
  });

  it('builds preview recipes from the V1 snapshot, not live V2 quantities', () => {
    const map = recipesFromLineSnapshots([line()]);
    const preview = map.get('rec-1');

    expect(preview?.version).toBe(1);
    expect(preview?.ingredients[0]?.quantity).toBe(1);
    expect(preview?.batchOutputQuantity).toBe(10);
  });
});
