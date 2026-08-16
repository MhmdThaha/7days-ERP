import type { Production, ProductionLineItem } from '@/types/production';
import type { Recipe } from '@/types/recipe';

export function hasDraftRecipeVersionMismatch(
  production: Production,
  recipesById: Map<string, Recipe>,
): boolean {
  for (const line of production.lines) {
    const recipe = recipesById.get(line.recipeId);

    if (recipe && recipe.version !== line.recipeVersion) {
      return true;
    }
  }

  return false;
}

/** Show Recipe Changed only for drafts that have not already chosen Keep Current. */
export function shouldPromptRecipeChanged(
  production: Production,
  recipesById: Map<string, Recipe>,
): boolean {
  if (production.status !== 'draft' || production.acceptedStaleRecipe) {
    return false;
  }

  return hasDraftRecipeVersionMismatch(production, recipesById);
}

export function toPreviewRecipeFromLineSnapshot(line: ProductionLineItem): Recipe | null {
  if (!line.recipeIngredients?.length) {
    return null;
  }

  return {
    id: line.recipeId,
    organizationId: '',
    productId: line.productId,
    recipeCode: line.recipeCode,
    recipeName: line.recipeName,
    version: line.recipeVersion,
    batchOutputQuantity: line.recipeBatchOutputQuantity ?? null,
    targetWeightGrams: null,
    ingredients: line.recipeIngredients,
    totalWeight: 0,
    notes: null,
    isActive: true,
    createdAt: new Date(0),
    createdBy: '',
    updatedAt: new Date(0),
    updatedBy: '',
    deletedAt: null,
    deletedBy: null,
  };
}

export function recipesFromLineSnapshots(lines: ProductionLineItem[]): Map<string, Recipe> {
  const map = new Map<string, Recipe>();

  for (const line of lines) {
    const recipe = toPreviewRecipeFromLineSnapshot(line);

    if (recipe) {
      map.set(recipe.id, recipe);
    }
  }

  return map;
}
