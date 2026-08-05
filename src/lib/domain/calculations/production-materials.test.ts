import { describe, expect, it } from 'vitest';

import { buildMaterialPreview, buildMaterialRowsFromRawOutMovements } from '@/lib/domain/calculations/production-materials';
import type { InventoryMovement } from '@/types/inventory';
import type { Recipe } from '@/types/recipe';
import type { RawMaterialListItem } from '@/types/raw-material';

function movement(
  overrides: Pick<InventoryMovement, 'itemId' | 'itemName' | 'quantity' | 'unit'>,
): InventoryMovement {
  return {
    id: `mov-${overrides.itemId}`,
    organizationId: 'org',
    movementDate: '2026-08-02',
    itemType: 'raw_material',
    itemId: overrides.itemId,
    itemName: overrides.itemName,
    movementType: 'PRODUCTION_RAW_OUT',
    quantity: overrides.quantity,
    unit: overrides.unit,
    unitCost: 100,
    totalCost: 100,
    balanceAfter: 0,
    averageCostAfter: 100,
    sourceDocumentType: 'production',
    sourceDocumentId: 'prod-1',
    sourceLineId: 'line-1',
    notes: null,
    createdAt: new Date('2026-08-02T03:15:00.000Z'),
    createdBy: 'user',
  };
}

describe('buildMaterialRowsFromRawOutMovements', () => {
  it('returns consumed quantities from PRODUCTION_RAW_OUT movements', () => {
    const rawMaterialsById = new Map<string, RawMaterialListItem>([
      [
        'maida-id',
        {
          id: 'maida-id',
          code: 'RM-001',
          name: 'maida',
          unit: 'kg',
          currentStock: 50,
          averageCost: 3120,
          isActive: true,
        },
      ],
    ]);

    const rows = buildMaterialRowsFromRawOutMovements(
      [
        movement({ itemId: 'maida-id', itemName: 'maida', quantity: 26.1156, unit: 'kg' }),
        movement({ itemId: 'sugar-id', itemName: 'sugar', quantity: 6.5292, unit: 'kg' }),
      ],
      rawMaterialsById,
    );

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.rawMaterialId === 'maida-id')).toMatchObject({
      rawMaterialCode: 'RM-001',
      rawMaterialName: 'maida',
      requiredQuantity: 26.1156,
      unit: 'kg',
    });
    expect(rows.find((row) => row.rawMaterialId === 'sugar-id')).toMatchObject({
      rawMaterialName: 'sugar',
      requiredQuantity: 6.5292,
      unit: 'kg',
    });
  });

  it('differs from live recipe preview after recipe edit', () => {
    const recipeA: Recipe = {
      id: 'recipe-a',
      organizationId: 'org',
      productId: 'product-1',
      recipeCode: 'RCP-001',
      recipeName: 'big bread',
      version: 1,
      batchOutputQuantity: 1,
      targetWeightGrams: null,
      ingredients: [
        {
          rawMaterialId: 'maida-id',
          rawMaterialName: 'maida',
          quantity: 0.21763,
          unit: 'kg',
        },
      ],
      totalWeight: 0.21763,
      notes: null,
      isActive: true,
      createdAt: new Date(),
      createdBy: 'user',
      updatedAt: new Date(),
      updatedBy: 'user',
      deletedAt: null,
      deletedBy: null,
    };

    const recipeB: Recipe = {
      ...recipeA,
      ingredients: [
        {
          rawMaterialId: 'maida-id',
          rawMaterialName: 'maida',
          quantity: 999,
          unit: 'kg',
        },
      ],
    };

    const rawMaterialsById = new Map<string, RawMaterialListItem>([
      [
        'maida-id',
        {
          id: 'maida-id',
          code: 'RM-001',
          name: 'maida',
          unit: 'kg',
          currentStock: 50,
          averageCost: 3120,
          isActive: true,
        },
      ],
    ]);

    const previewFromEditedRecipe = buildMaterialPreview(
      [{ productId: 'product-1', quantity: 120, recipeId: 'recipe-a' }],
      new Map([['recipe-a', recipeB]]),
      rawMaterialsById,
    );

    const historicalRows = buildMaterialRowsFromRawOutMovements(
      [movement({ itemId: 'maida-id', itemName: 'maida', quantity: 26.1156, unit: 'kg' })],
      rawMaterialsById,
    );

    expect(previewFromEditedRecipe[0]?.requiredQuantity).toBe(119880);
    expect(historicalRows[0]?.requiredQuantity).toBe(26.1156);
    expect(historicalRows[0]?.requiredQuantity).not.toBe(previewFromEditedRecipe[0]?.requiredQuantity);
  });
});
