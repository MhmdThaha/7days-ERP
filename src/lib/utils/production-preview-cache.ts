import type { QueryClient } from '@tanstack/react-query';

import { getRawMaterialsByIdsAction } from '@/actions/raw-materials';
import { getRecipeAction } from '@/actions/recipes';
import { toRawMaterialListItem } from '@/lib/utils/catalog-list-item';
import type { Recipe } from '@/types/recipe';
import type { RawMaterialListItem } from '@/types/raw-material';

export const PRODUCTION_PREVIEW_STALE_TIME = 5 * 60 * 1000;

export function productionFullRecipesQueryKey(recipeIds: string[]) {
  return ['recipes', 'production-full', recipeIds] as const;
}

export function rawMaterialsByIdsQueryKey(userId: string | undefined, rawMaterialIds: string[]) {
  return ['raw-materials-by-ids', userId, rawMaterialIds] as const;
}

export async function fetchProductionFullRecipes(recipeIds: string[]): Promise<Recipe[]> {
  const results = await Promise.all(recipeIds.map((id) => getRecipeAction(id)));
  const recipes: Recipe[] = [];

  for (const result of results) {
    if (result.success) {
      recipes.push(result.data);
    }
  }

  return recipes;
}

export function extractPreviewMaterialIds(recipes: Recipe[]): string[] {
  const ids = new Set<string>();

  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) {
      ids.add(ingredient.rawMaterialId);
    }
  }

  return [...ids].sort();
}

export async function fetchRawMaterialsMap(
  rawMaterialIds: string[],
  userId: string | undefined,
  queryClient: QueryClient,
): Promise<Map<string, RawMaterialListItem>> {
  const uniqueIds = [...new Set(rawMaterialIds.filter(Boolean))].sort();

  if (uniqueIds.length === 0) {
    return new Map();
  }

  const result = await getRawMaterialsByIdsAction(uniqueIds);

  if (!result.success) {
    throw new Error(result.error);
  }

  const map = new Map<string, RawMaterialListItem>();

  for (const material of result.data) {
    const listItem = toRawMaterialListItem(material);
    map.set(material.id, listItem);

    if (userId) {
      queryClient.setQueryData(['raw-material', userId, material.id], listItem);
    }
  }

  return map;
}

export async function prefetchPreviewMaterialsForRecipes(
  queryClient: QueryClient,
  userId: string | undefined,
  recipes: Recipe[],
): Promise<void> {
  const materialIds = extractPreviewMaterialIds(recipes);

  if (materialIds.length === 0) {
    return;
  }

  await queryClient.fetchQuery({
    queryKey: rawMaterialsByIdsQueryKey(userId, materialIds),
    queryFn: () => fetchRawMaterialsMap(materialIds, userId, queryClient),
    staleTime: PRODUCTION_PREVIEW_STALE_TIME,
  });
}

export async function fetchProductionPreviewPipeline(
  queryClient: QueryClient,
  userId: string | undefined,
  recipeIds: string[],
): Promise<Recipe[]> {
  const recipes = await fetchProductionFullRecipes(recipeIds);

  try {
    await prefetchPreviewMaterialsForRecipes(queryClient, userId, recipes);
  } catch {
    // Materials hook retries independently if prefetch fails.
  }

  return recipes;
}
