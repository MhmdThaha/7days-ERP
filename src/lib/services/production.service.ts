import 'server-only';

import { PRODUCTION_NUMBER_PREFIX } from '@/lib/domain/constants/production';
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
  ProductionListParams,
  ProductionListResult,
  UpdateProductionInput,
} from '@/types/production';

function formatGeneratedNumber(sequence: number): string {
  return `${PRODUCTION_NUMBER_PREFIX}-${String(sequence).padStart(3, '0')}`;
}

function calculateTotalUnits(lines: ProductionLineItem[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

async function resolveProductionNumber(orgId: string): Promise<string> {
  const highest = await productionRepository.getHighestProductionNumber(orgId);
  let next = highest + 1;
  let generated = formatGeneratedNumber(next);

  while (await productionRepository.findByProductionNumber(orgId, generated)) {
    next += 1;
    generated = formatGeneratedNumber(next);
  }

  return generated;
}

async function resolveLineItems(
  orgId: string,
  lines: ProductionLineItemInput[],
): Promise<ProductionLineItem[]> {
  const resolved: ProductionLineItem[] = [];

  for (const line of lines) {
    const product = await productRepository.getById(orgId, line.productId);

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

    const recipe = await recipeRepository.getById(orgId, product.activeRecipeId);

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

  async getById(orgId: string, productionId: string): Promise<Production> {
    const production = await productionRepository.getById(orgId, productionId);

    if (!production) {
      throw new DomainError('NOT_FOUND', 'Production entry not found');
    }

    return production;
  },

  async create(orgId: string, input: CreateProductionInput, userId: string): Promise<Production> {
    const productionNumber = await resolveProductionNumber(orgId);
    const lines = await resolveLineItems(orgId, input.lines);
    const totalUnits = calculateTotalUnits(lines);

    return productionRepository.create(
      orgId,
      {
        productionNumber,
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

    if (input.lines) {
      lines = await resolveLineItems(orgId, input.lines);
      totalUnits = calculateTotalUnits(lines);
    }

    return productionRepository.update(
      orgId,
      productionId,
      {
        productionDate: input.productionDate,
        lines: input.lines ? lines : undefined,
        totalUnits: input.lines ? totalUnits : undefined,
        notes: input.notes,
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
    const existing = await productionRepository.getById(orgId, productionId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Production entry not found');
    }

    assertDraftProduction(existing);

    const completed = await productionRepository.complete(orgId, productionId, userId);
    await dailySummaryService.recalculateAfterMutation(orgId, completed.productionDate);
    return completed;
  },
};
