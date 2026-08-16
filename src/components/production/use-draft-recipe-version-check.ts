'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { updateProductionAction } from '@/actions/production';
import { getRecipeAction } from '@/actions/recipes';
import { shouldPromptRecipeChanged } from '@/lib/domain/production/draft-recipe-version';
import { toastFormError } from '@/lib/utils/toast-form-error';
import type { Production } from '@/types/production';
import type { Recipe } from '@/types/recipe';

type UseDraftRecipeVersionCheckOptions = {
  production: Production | undefined;
  productionId: string;
  isAuthenticated: boolean;
  queryClient: QueryClient;
};

export function useDraftRecipeVersionCheck({
  production,
  productionId,
  isAuthenticated,
  queryClient,
}: UseDraftRecipeVersionCheckOptions) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isUpdatingDraft, setIsUpdatingDraft] = useState(false);

  const isDraft = production?.status === 'draft';
  const recipeIds = useMemo(
    () => [...new Set((production?.lines ?? []).map((line) => line.recipeId))].sort(),
    [production?.lines],
  );

  const { data: recipes, isLoading: isLoadingRecipes } = useQuery({
    queryKey: ['recipes', 'draft-recipe-check', productionId, recipeIds],
    enabled: isAuthenticated && isDraft && recipeIds.length > 0,
    queryFn: async () => {
      const results = await Promise.all(recipeIds.map((id) => getRecipeAction(id)));
      const loaded: Recipe[] = [];

      for (const result of results) {
        if (result.success) {
          loaded.push(result.data);
        }
      }

      return loaded;
    },
  });

  const recipesById = useMemo(() => {
    const map = new Map<string, Recipe>();

    for (const recipe of recipes ?? []) {
      map.set(recipe.id, recipe);
    }

    return map;
  }, [recipes]);

  const hasMismatch = useMemo(() => {
    if (!production || !isDraft || isLoadingRecipes) {
      return false;
    }

    return shouldPromptRecipeChanged(production, recipesById);
  }, [production, isDraft, isLoadingRecipes, recipesById]);

  useEffect(() => {
    if (!hasMismatch) {
      return;
    }

    setDialogOpen(true);
  }, [hasMismatch]);

  async function persistDraftChoice(
    input: Parameters<typeof updateProductionAction>[1],
    successMessage: string,
  ) {
    if (!production || isUpdatingDraft) {
      return;
    }

    setIsUpdatingDraft(true);

    try {
      const result = await updateProductionAction(productionId, input);

      if (!result.success) {
        toastFormError(result.error);
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['production', productionId] }),
        queryClient.invalidateQueries({ queryKey: ['recipes'] }),
      ]);

      setDialogOpen(false);
      toast.success(successMessage);
    } finally {
      setIsUpdatingDraft(false);
    }
  }

  async function handleUpdateDraft() {
    await persistDraftChoice(
      {
        productionDate: production?.productionDate,
        lines: (production?.lines ?? []).map((line) => ({
          id: line.id,
          productId: line.productId,
          quantity: line.quantity,
          unit: line.unit,
        })),
        notes: production?.notes,
      },
      'Draft updated to use the latest recipe.',
    );
  }

  async function handleContinueWithCurrentDraft() {
    await persistDraftChoice(
      { acceptedStaleRecipe: true },
      'Draft kept on the current recipe.',
    );
  }

  function handleClose() {
    setDialogOpen(false);
  }

  return {
    dialogOpen,
    isUpdatingDraft,
    handleUpdateDraft,
    handleContinueWithCurrentDraft,
    handleClose,
    setDialogOpen,
  };
}
