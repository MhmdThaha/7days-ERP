import { resolveRecipeBatchOutputQuantity } from '@/lib/domain/calculations/production-materials';
import type { RecipeIngredient } from '@/types/recipe';

export type ProductionLineFormula = {
  ingredients: RecipeIngredient[];
  batchOutputQuantity: number;
};

/**
 * Keep Current uses the draft snapshot. Otherwise complete/preview follow the live recipe
 * (including drafts created before snapshots existed).
 */
export function resolveProductionLineFormula(input: {
  acceptedStaleRecipe: boolean;
  snapshotIngredients?: RecipeIngredient[] | null;
  snapshotBatchOutputQuantity?: number | null;
  liveIngredients: RecipeIngredient[];
  liveBatchOutputQuantity: number | null | undefined;
}): ProductionLineFormula {
  const snapshot = input.snapshotIngredients;
  const useSnapshot =
    input.acceptedStaleRecipe && Array.isArray(snapshot) && snapshot.length > 0;

  if (useSnapshot) {
    return {
      ingredients: snapshot,
      batchOutputQuantity: resolveRecipeBatchOutputQuantity(input.snapshotBatchOutputQuantity),
    };
  }

  return {
    ingredients: input.liveIngredients,
    batchOutputQuantity: resolveRecipeBatchOutputQuantity(input.liveBatchOutputQuantity),
  };
}
