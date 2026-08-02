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
    // [PERF-TEMP] instrumentation — remove after performance investigation
    const perfStart = performance.now();
    let perfLast = perfStart;
    const perfMark = (label: string) => {
      const now = performance.now();
      console.log(`[PERF][action] ${label}: ${(now - perfLast).toFixed(0)} ms`);
      perfLast = now;
    };
    console.log(`[PERF][action] createRecipeAction started at ${new Date().toISOString()}`);

    const { orgId, userId, role } = await getAuthenticatedContext();
    perfMark('authentication (session verify + user profile read)'); // [PERF-TEMP]
    assertCan(role, 'create', 'recipe');
    perfMark('authorization (assertCan)'); // [PERF-TEMP]
    const validated = createRecipeSchema.parse({
      ...input,
      recipeCode: input.recipeCode ?? '',
      notes: input.notes ?? null,
      isActive: input.isActive ?? true,
    });
    perfMark('zod validation'); // [PERF-TEMP]

    const created = await recipeService.create(
      orgId,
      {
        productId: validated.productId,
        recipeCode: validated.recipeCode,
        recipeName: validated.recipeName,
        batchOutputQuantity: validated.batchOutputQuantity ?? null,
        targetWeightGrams: validated.targetWeightGrams ?? null,
        ingredients: validated.ingredients,
        notes: validated.notes ?? null,
        isActive: validated.isActive,
      },
      userId,
    );
    perfMark('recipeService.create total'); // [PERF-TEMP]
    console.log(
      `[PERF][action] createRecipeAction TOTAL (server): ${(performance.now() - perfStart).toFixed(0)} ms`,
    );
    return created;
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
