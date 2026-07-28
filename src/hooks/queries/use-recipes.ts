'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listRecipesAction } from '@/actions/recipes';
import { useAuth } from '@/hooks/use-auth';
import { RECIPE_PAGE_SIZE } from '@/lib/domain/constants/recipe';
import type { RecipeListParams } from '@/types/recipe';

export function useRecipes(params: RecipeListParams) {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['recipes', user?.uid, params],
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
    enabled: isAuthenticated,
    placeholderData: keepPreviousData,
  });
}
