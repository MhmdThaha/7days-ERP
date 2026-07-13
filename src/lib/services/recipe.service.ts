import 'server-only';

import { RECIPE_CODE_PREFIX } from '@/lib/domain/constants/recipe';
import { DomainError } from '@/lib/domain/errors';
import { productRepository } from '@/lib/repositories/product.repository';
import { rawMaterialRepository } from '@/lib/repositories/raw-material.repository';
import { recipeRepository } from '@/lib/repositories/recipe.repository';
import type {
  CreateRecipeInput,
  Recipe,
  RecipeIngredient,
  RecipeIngredientInput,
  RecipeListParams,
  RecipeListResult,
  UpdateRecipeInput,
} from '@/types/recipe';

function formatGeneratedCode(sequence: number): string {
  return `${RECIPE_CODE_PREFIX}-${String(sequence).padStart(3, '0')}`;
}

function calculateTotalWeight(ingredients: RecipeIngredient[]): number {
  return ingredients.reduce((sum, ingredient) => sum + ingredient.quantity, 0);
}

async function resolveUniqueCode(
  orgId: string,
  code: string | undefined,
  excludeId?: string,
): Promise<string> {
  if (code && code.trim().length > 0) {
    const normalized = code.trim().toUpperCase();
    const existing = await recipeRepository.findByCode(orgId, normalized, excludeId);

    if (existing) {
      throw new DomainError('DUPLICATE_CODE', 'Recipe code already in use');
    }

    return normalized;
  }

  const highest = await recipeRepository.getHighestCodeNumber(orgId);
  let next = highest + 1;
  let generated = formatGeneratedCode(next);

  while (await recipeRepository.findByCode(orgId, generated, excludeId)) {
    next += 1;
    generated = formatGeneratedCode(next);
  }

  return generated;
}

async function resolveIngredients(
  orgId: string,
  ingredients: RecipeIngredientInput[],
): Promise<RecipeIngredient[]> {
  const resolved: RecipeIngredient[] = [];

  for (const ingredient of ingredients) {
    const rawMaterial = await rawMaterialRepository.getById(orgId, ingredient.rawMaterialId);

    if (!rawMaterial) {
      throw new DomainError('NOT_FOUND', 'One or more raw materials were not found');
    }

    if (!rawMaterial.isActive) {
      throw new DomainError('VALIDATION_ERROR', `Raw material "${rawMaterial.name}" is inactive`);
    }

    resolved.push({
      rawMaterialId: rawMaterial.id,
      rawMaterialName: rawMaterial.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit || rawMaterial.unit,
    });
  }

  return resolved;
}

async function assertNoDuplicateActiveRecipe(
  orgId: string,
  productId: string,
  excludeId?: string,
): Promise<void> {
  const existing = await recipeRepository.findActiveByProductId(orgId, productId, excludeId);

  if (existing) {
    throw new DomainError(
      'DUPLICATE_ACTIVE_RECIPE',
      'This product already has an active recipe',
    );
  }
}

async function syncProductActiveRecipe(
  orgId: string,
  productId: string,
  recipeId: string | null,
  userId: string,
): Promise<void> {
  await productRepository.updateActiveRecipeId(orgId, productId, recipeId, userId);
}

async function buildProductNameMap(orgId: string): Promise<Map<string, string>> {
  const snapshot = await productRepository.list(orgId, {
    status: 'all',
    page: 1,
    pageSize: 1000,
  });

  return new Map(snapshot.items.map((product) => [product.id, product.name]));
}

export const recipeService = {
  async list(orgId: string, params: RecipeListParams): Promise<RecipeListResult> {
    const productNames = await buildProductNameMap(orgId);
    return recipeRepository.list(orgId, params, productNames);
  },

  async getById(orgId: string, recipeId: string): Promise<Recipe> {
    const recipe = await recipeRepository.getById(orgId, recipeId);

    if (!recipe) {
      throw new DomainError('NOT_FOUND', 'Recipe not found');
    }

    return recipe;
  },

  async create(orgId: string, input: CreateRecipeInput, userId: string): Promise<Recipe> {
    const product = await productRepository.getById(orgId, input.productId);

    if (!product) {
      throw new DomainError('NOT_FOUND', 'Product not found');
    }

    if (!product.isActive) {
      throw new DomainError('PRODUCT_INACTIVE', 'Cannot create a recipe for an inactive product');
    }

    const isActive = input.isActive ?? true;

    if (isActive) {
      await assertNoDuplicateActiveRecipe(orgId, input.productId);
    }

    const recipeCode = await resolveUniqueCode(orgId, input.recipeCode);
    const ingredients = await resolveIngredients(orgId, input.ingredients);
    const totalWeight = calculateTotalWeight(ingredients);

    const recipe = await recipeRepository.create(
      orgId,
      {
        ...input,
        recipeCode,
        ingredients,
        totalWeight,
        isActive,
      },
      userId,
    );

    if (isActive) {
      await syncProductActiveRecipe(orgId, input.productId, recipe.id, userId);
    }

    return recipe;
  },

  async update(
    orgId: string,
    recipeId: string,
    input: UpdateRecipeInput,
    userId: string,
  ): Promise<Recipe> {
    const existing = await recipeRepository.getById(orgId, recipeId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Recipe not found');
    }

    let ingredients = existing.ingredients;
    let totalWeight = existing.totalWeight;

    if (input.ingredients) {
      ingredients = await resolveIngredients(orgId, input.ingredients);
      totalWeight = calculateTotalWeight(ingredients);
    }

    const nextIsActive = input.isActive ?? existing.isActive;

    if (nextIsActive) {
      await assertNoDuplicateActiveRecipe(orgId, existing.productId, recipeId);
    }

    const recipe = await recipeRepository.update(
      orgId,
      recipeId,
      {
        ...input,
        ingredients: input.ingredients ? ingredients : undefined,
        totalWeight: input.ingredients ? totalWeight : undefined,
        isActive: input.isActive,
      },
      userId,
    );

    if (nextIsActive) {
      await syncProductActiveRecipe(orgId, existing.productId, recipe.id, userId);
    } else if (existing.isActive) {
      const product = await productRepository.getById(orgId, existing.productId);

      if (product?.activeRecipeId === recipeId) {
        await syncProductActiveRecipe(orgId, existing.productId, null, userId);
      }
    }

    return recipe;
  },

  async softDelete(orgId: string, recipeId: string, userId: string): Promise<void> {
    const existing = await recipeRepository.getById(orgId, recipeId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Recipe not found');
    }

    await recipeRepository.softDelete(orgId, recipeId, userId);

    const product = await productRepository.getById(orgId, existing.productId);

    if (product?.activeRecipeId === recipeId) {
      await syncProductActiveRecipe(orgId, existing.productId, null, userId);
    }
  },
};
