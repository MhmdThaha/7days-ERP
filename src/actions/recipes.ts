'use server';

import {
  createRecipeSchema,
  recipeListParamsSchema,
  updateRecipeSchema,
} from '@/lib/domain/schemas/recipe.schema';
import { DomainError } from '@/lib/domain/errors';
import { assertCan } from '@/lib/domain/permissions';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
import { recipeService } from '@/lib/services/recipe.service';
import { wrapAction, type ActionResult } from '@/lib/utils/action-result';
import type {
  CreateRecipeInput,
  Recipe,
  RecipeListParams,
  RecipeListResult,
  UpdateRecipeInput,
} from '@/types/recipe';

export async function listRecipesAction(
  params: RecipeListParams,
): Promise<ActionResult<RecipeListResult>> {
  return wrapAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'recipe');
    const validated = recipeListParamsSchema.parse(params);
    return recipeService.list(orgId, validated);
  });
}

export async function getRecipeAction(recipeId: string): Promise<ActionResult<Recipe>> {
  return wrapAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'recipe');
    return recipeService.getById(orgId, recipeId);
  });
}

export async function createRecipeAction(input: CreateRecipeInput): Promise<ActionResult<Recipe>> {
  return wrapAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'create', 'recipe');
    const validated = createRecipeSchema.parse({
      ...input,
      recipeCode: input.recipeCode ?? '',
      notes: input.notes ?? null,
      isActive: input.isActive ?? true,
    });

    return recipeService.create(
      orgId,
      {
        productId: validated.productId,
        recipeCode: validated.recipeCode,
        recipeName: validated.recipeName,
        ingredients: validated.ingredients,
        notes: validated.notes ?? null,
        isActive: validated.isActive,
      },
      userId,
    );
  });
}

export async function updateRecipeAction(
  recipeId: string,
  input: UpdateRecipeInput,
): Promise<ActionResult<Recipe>> {
  return wrapAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'update', 'recipe');
    const validated = updateRecipeSchema.parse({
      ...input,
      notes: input.notes ?? undefined,
    });

    if (Object.keys(validated).length === 0) {
      throw new DomainError('VALIDATION_ERROR', 'No changes provided');
    }

    return recipeService.update(orgId, recipeId, validated, userId);
  });
}

export async function deleteRecipeAction(recipeId: string): Promise<ActionResult<void>> {
  return wrapAction(async () => {
    const { orgId, userId, role } = await getAuthenticatedContext();
    assertCan(role, 'delete', 'recipe');
    await recipeService.softDelete(orgId, recipeId, userId);
  });
}
