'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listRecipesAction } from '@/actions/recipes';
import { RECIPE_PAGE_SIZE } from '@/lib/domain/constants/recipe';
import type { RecipeListParams } from '@/types/recipe';

export function useRecipes(params: RecipeListParams) {
  return useQuery({
    queryKey: ['recipes', params],
    queryFn: async () => {
      const result = await listRecipesAction({
        search: params.search,
        status: params.status ?? 'active',
        page: params.page ?? 1,
        pageSize: params.pageSize ?? RECIPE_PAGE_SIZE,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    placeholderData: keepPreviousData,
  });
}
