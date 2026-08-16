import 'server-only';

import { DomainError } from '@/lib/domain/errors';
import { productRepository } from '@/lib/repositories/product.repository';
import {
  generateProductionLineId,
  productionRepository,
} from '@/lib/repositories/production.repository';
import { recipeRepository } from '@/lib/repositories/recipe.repository';
import { dailySummaryService } from '@/lib/services/daily-summary.service';
import type {
  CreateProductionInput,
  Production,
  ProductionLineItem,
  ProductionLineItemInput,
  ProductionListItem,
  ProductionListPageParams,
  ProductionListPageResult,
  ProductionListParams,
  ProductionListResult,
  UpdateProductionInput,
} from '@/types/production';

function calculateTotalUnits(lines: ProductionLineItem[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

async function resolveLineItems(
  orgId: string,
  lines: ProductionLineItemInput[],
): Promise<ProductionLineItem[]> {
  const uniqueProductIds = [...new Set(lines.map((line) => line.productId).filter(Boolean))];
  const products =
    uniqueProductIds.length === 0
      ? []
      : await productRepository.getByIds(orgId, uniqueProductIds);
  const productsById = new Map(products.map((product) => [product.id, product]));

  const uniqueRecipeIds = [
    ...new Set(
      uniqueProductIds
        .map((productId) => productsById.get(productId)?.activeRecipeId)
        .filter((recipeId): recipeId is string => Boolean(recipeId)),
    ),
  ];
  const recipes =
    uniqueRecipeIds.length === 0
      ? []
      : await recipeRepository.getByIds(orgId, uniqueRecipeIds);
  const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  const resolved: ProductionLineItem[] = [];

  for (const line of lines) {
    const product = productsById.get(line.productId);

    if (!product) {
      throw new DomainError('NOT_FOUND', 'One or more products were not found');
    }

    if (!product.isActive) {
      throw new DomainError('VALIDATION_ERROR', `Product "${product.name}" is inactive`);
    }

    if (!product.activeRecipeId) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Product "${product.name}" does not have an active recipe`,
      );
    }

    const recipe = recipesById.get(product.activeRecipeId);

    if (!recipe) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Product "${product.name}" does not have an active recipe`,
      );
    }

    if (!recipe.isActive || recipe.deletedAt) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Product "${product.name}" does not have an active recipe`,
      );
    }

    if (recipe.productId !== product.id) {
      throw new DomainError('VALIDATION_ERROR', 'Recipe does not match the selected product');
    }

    resolved.push({
      id: line.id ?? generateProductionLineId(),
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      quantity: line.quantity,
      unit: line.unit || product.unit,
      recipeId: recipe.id,
      recipeCode: recipe.recipeCode,
      recipeName: recipe.recipeName,
      recipeVersion: recipe.version,
      recipeBatchOutputQuantity: recipe.batchOutputQuantity,
      recipeIngredients: recipe.ingredients.map((ingredient) => ({
        rawMaterialId: ingredient.rawMaterialId,
        rawMaterialName: ingredient.rawMaterialName,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
      })),
    });
  }

  return resolved;
}

function assertDraftProduction(production: Production): void {
  if (production.status !== 'draft') {
    throw new DomainError('VALIDATION_ERROR', 'Only draft production entries can be modified');
  }
}

export const productionService = {
  async list(orgId: string, params: ProductionListParams): Promise<ProductionListResult> {
    return productionRepository.list(orgId, params);
  },

  async getLatestForRepeat(orgId: string): Promise<ProductionListItem | null> {
    return productionRepository.getLatestForRepeat(orgId);
  },

  /**
   * Production page retrieval: empty search → Firestore listPage; non-empty search → legacy list()
   * substring semantics (unchanged).
   */
  async listPage(
    orgId: string,
    params: ProductionListPageParams,
  ): Promise<ProductionListPageResult> {
    const search = params.search?.trim() ?? '';

    if (search) {
      const result = await productionRepository.list(orgId, {
        search,
        status: params.status,
        page: params.page ?? 1,
        pageSize: params.pageSize,
      });

      const first = result.items[0];
      const last = result.items[result.items.length - 1];

      return {
        ...result,
        startCursor: first
          ? { productionDate: first.productionDate, productionNumber: first.productionNumber }
          : null,
        endCursor: last
          ? { productionDate: last.productionDate, productionNumber: last.productionNumber }
          : null,
      };
    }

    return productionRepository.listPage(orgId, {
      status: params.status,
      pageSize: params.pageSize,
      page: params.page,
      position: params.position,
      cursor: params.cursor,
    });
  },

  async getById(orgId: string, productionId: string): Promise<Production> {
    const production = await productionRepository.getById(orgId, productionId);

    if (!production) {
      throw new DomainError('NOT_FOUND', 'Production entry not found');
    }

    return production;
  },

  async create(orgId: string, input: CreateProductionInput, userId: string): Promise<Production> {
    const lines = await resolveLineItems(orgId, input.lines);
    const totalUnits = calculateTotalUnits(lines);

    return productionRepository.create(
      orgId,
      {
        productionDate: input.productionDate,
        lines,
        totalUnits,
        notes: input.notes,
      },
      userId,
    );
  },

  async update(
    orgId: string,
    productionId: string,
    input: UpdateProductionInput,
    userId: string,
  ): Promise<Production> {
    const existing = await productionRepository.getById(orgId, productionId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Production entry not found');
    }

    assertDraftProduction(existing);

    let lines = existing.lines;
    let totalUnits = existing.totalUnits;
    let acceptedStaleRecipe: boolean | undefined;

    if (input.lines) {
      lines = await resolveLineItems(orgId, input.lines);
      totalUnits = calculateTotalUnits(lines);
      acceptedStaleRecipe = false;
    } else if (input.acceptedStaleRecipe !== undefined) {
      acceptedStaleRecipe = input.acceptedStaleRecipe;
    }

    return productionRepository.update(
      orgId,
      productionId,
      {
        productionDate: input.productionDate,
        lines: input.lines ? lines : undefined,
        totalUnits: input.lines ? totalUnits : undefined,
        notes: input.notes,
        acceptedStaleRecipe,
      },
      userId,
    );
  },

  async softDelete(orgId: string, productionId: string, userId: string): Promise<void> {
    const existing = await productionRepository.getById(orgId, productionId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Production entry not found');
    }

    assertDraftProduction(existing);

    await productionRepository.softDelete(orgId, productionId, userId);
  },

  async complete(orgId: string, productionId: string, userId: string): Promise<Production> {
    const completed = await productionRepository.complete(orgId, productionId, userId);
    await dailySummaryService.scheduleRecalculationAfterCommit(orgId, completed.productionDate);
    return completed;
  },
};
