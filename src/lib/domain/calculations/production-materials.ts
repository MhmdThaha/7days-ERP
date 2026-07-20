import { DEFAULT_RECIPE_YIELD_QUANTITY } from '@/lib/domain/constants/production';
import type { MaterialPreviewRow } from '@/types/production';
import type { Recipe } from '@/types/recipe';
import type { RawMaterialListItem } from '@/types/raw-material';

export type ProductionPreviewLine = {
  productId: string;
  quantity: number;
  recipeId: string | null;
};

export function calculateLineUnitCost(
  ingredients: Array<{ rawMaterialId: string; quantity: number }>,
  productionQuantity: number,
  rawMaterialWacById: Map<string, number>,
  yieldQuantity: number = DEFAULT_RECIPE_YIELD_QUANTITY,
): number {
  if (productionQuantity <= 0) {
    return 0;
  }

  let totalMaterialCost = 0;

  for (const ingredient of ingredients) {
    const consumed = scaleIngredientQuantity(
      ingredient.quantity,
      productionQuantity,
      yieldQuantity,
    );
    const unitCost = rawMaterialWacById.get(ingredient.rawMaterialId) ?? 0;
    totalMaterialCost += Math.round(consumed * unitCost);
  }

  return Math.round(totalMaterialCost / productionQuantity);
}

export function scaleIngredientQuantity(
  ingredientQuantity: number,
  productionQuantity: number,
  yieldQuantity: number = DEFAULT_RECIPE_YIELD_QUANTITY,
): number {
  if (yieldQuantity <= 0 || productionQuantity <= 0) {
    return 0;
  }

  return ingredientQuantity * (productionQuantity / yieldQuantity);
}

export function buildMaterialPreview(
  lines: ProductionPreviewLine[],
  recipesById: Map<string, Recipe>,
  rawMaterialsById: Map<string, RawMaterialListItem>,
): MaterialPreviewRow[] {
  const aggregated = new Map<
    string,
    {
      rawMaterialCode: string;
      rawMaterialName: string;
      unit: string;
      requiredQuantity: number;
    }
  >();

  for (const line of lines) {
    if (!line.recipeId || line.quantity <= 0) {
      continue;
    }

    const recipe = recipesById.get(line.recipeId);

    if (!recipe || !recipe.isActive) {
      continue;
    }

    for (const ingredient of recipe.ingredients) {
      const required = scaleIngredientQuantity(ingredient.quantity, line.quantity);
      const existing = aggregated.get(ingredient.rawMaterialId);

      if (existing) {
        existing.requiredQuantity += required;
        continue;
      }

      const rawMaterial = rawMaterialsById.get(ingredient.rawMaterialId);

      aggregated.set(ingredient.rawMaterialId, {
        rawMaterialCode: rawMaterial?.code ?? '—',
        rawMaterialName: ingredient.rawMaterialName,
        unit: ingredient.unit || rawMaterial?.unit || '',
        requiredQuantity: required,
      });
    }
  }

  return Array.from(aggregated.entries())
    .map(([rawMaterialId, row]) => {
      const rawMaterial = rawMaterialsById.get(rawMaterialId);
      const currentStock = rawMaterial?.currentStock ?? 0;
      const shortage = Math.max(0, row.requiredQuantity - currentStock);

      return {
        rawMaterialId,
        rawMaterialCode: row.rawMaterialCode,
        rawMaterialName: row.rawMaterialName,
        unit: row.unit,
        requiredQuantity: row.requiredQuantity,
        currentStock,
        shortage,
      };
    })
    .sort((a, b) => a.rawMaterialName.localeCompare(b.rawMaterialName));
}
