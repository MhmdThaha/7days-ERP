import { beforeEach, describe, expect, it, vi } from 'vitest';

import { productRepository } from '@/lib/repositories/product.repository';
import { productionRepository } from '@/lib/repositories/production.repository';
import { recipeRepository } from '@/lib/repositories/recipe.repository';
import { productionService } from '@/lib/services/production.service';
import type { Product } from '@/types/product';
import type { Production } from '@/types/production';
import type { Recipe } from '@/types/recipe';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/repositories/production.repository', () => ({
  productionRepository: {
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    complete: vi.fn(),
  },
  generateProductionLineId: vi.fn(() => 'prl-1'),
}));

vi.mock('@/lib/repositories/product.repository', () => ({
  productRepository: {
    getById: vi.fn(),
    getByIds: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/recipe.repository', () => ({
  recipeRepository: {
    getById: vi.fn(),
    getByIds: vi.fn(),
  },
}));

vi.mock('@/lib/services/daily-summary.service', () => ({
  dailySummaryService: {
    recalculateAfterMutation: vi.fn(),
  },
}));

function product(): Product {
  return {
    id: 'p-1',
    organizationId: 'org-a',
    code: 'CK-1',
    name: 'Cake',
    category: 'Cake',
    unit: 'pcs',
    sellingPrice: 100,
    description: null,
    isActive: true,
    currentStock: 0,
    averageCost: 0,
    activeRecipeId: 'rec-1',
    imageUrl: null,
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    createdBy: 'user-1',
    updatedAt: new Date('2026-08-16T00:00:00.000Z'),
    updatedBy: 'user-1',
    deletedAt: null,
    deletedBy: null,
  };
}

function recipe(version: number, maidaKg: number): Recipe {
  return {
    id: 'rec-1',
    organizationId: 'org-a',
    productId: 'p-1',
    recipeCode: 'R-1',
    recipeName: 'Cake Recipe',
    version,
    batchOutputQuantity: 10,
    targetWeightGrams: null,
    ingredients: [
      { rawMaterialId: 'rm-maida', rawMaterialName: 'Maida', quantity: maidaKg, unit: 'kg' },
    ],
    totalWeight: maidaKg,
    notes: null,
    isActive: true,
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    createdBy: 'user-1',
    updatedAt: new Date('2026-08-16T00:00:00.000Z'),
    updatedBy: 'user-1',
    deletedAt: null,
    deletedBy: null,
  };
}

function draft(overrides: Partial<Production> = {}): Production {
  return {
    id: 'prd-1',
    organizationId: 'org-a',
    productionNumber: 'PRD-001',
    productionDate: '2026-08-16',
    status: 'draft',
    lines: [
      {
        id: 'prl-1',
        productId: 'p-1',
        productCode: 'CK-1',
        productName: 'Cake',
        quantity: 10,
        unit: 'pcs',
        recipeId: 'rec-1',
        recipeCode: 'R-1',
        recipeName: 'Cake Recipe',
        recipeVersion: 1,
        recipeBatchOutputQuantity: 10,
        recipeIngredients: [
          { rawMaterialId: 'rm-maida', rawMaterialName: 'Maida', quantity: 1, unit: 'kg' },
        ],
      },
    ],
    totalUnits: 10,
    lineCount: 1,
    notes: null,
    acceptedStaleRecipe: false,
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    createdBy: 'user-1',
    updatedAt: new Date('2026-08-16T00:00:00.000Z'),
    updatedBy: 'user-1',
    completedAt: null,
    completedBy: null,
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

describe('production draft recipe version', () => {
  beforeEach(() => {
    vi.mocked(productionRepository.getById).mockReset();
    vi.mocked(productionRepository.create).mockReset();
    vi.mocked(productionRepository.update).mockReset();
    vi.mocked(productionRepository.complete).mockReset();
    vi.mocked(productRepository.getById).mockReset();
    vi.mocked(productRepository.getByIds).mockReset();
    vi.mocked(recipeRepository.getById).mockReset();
    vi.mocked(recipeRepository.getByIds).mockReset();
  });

  it('CASE A: Use New Recipe re-resolves the live V2 snapshot without completing', async () => {
    vi.mocked(productionRepository.getById).mockResolvedValue(draft());
    vi.mocked(productRepository.getByIds).mockResolvedValue([product()]);
    vi.mocked(recipeRepository.getByIds).mockResolvedValue([recipe(2, 2)]);
    vi.mocked(productionRepository.update).mockResolvedValue(draft({ acceptedStaleRecipe: false }));

    await productionService.update(
      'org-a',
      'prd-1',
      {
        productionDate: '2026-08-16',
        lines: [{ id: 'prl-1', productId: 'p-1', quantity: 10, unit: 'pcs' }],
      },
      'user-1',
    );

    expect(productionRepository.complete).not.toHaveBeenCalled();
    expect(productionRepository.update).toHaveBeenCalledWith(
      'org-a',
      'prd-1',
      expect.objectContaining({
        acceptedStaleRecipe: false,
        lines: [
          expect.objectContaining({
            recipeVersion: 2,
            recipeBatchOutputQuantity: 10,
            recipeIngredients: [
              expect.objectContaining({ rawMaterialId: 'rm-maida', quantity: 2, unit: 'kg' }),
            ],
          }),
        ],
      }),
      'user-1',
    );
  });

  it('CASE B: Keep Current persists the V1 snapshot and does not re-resolve lines', async () => {
    vi.mocked(productionRepository.getById).mockResolvedValue(draft());
    vi.mocked(productionRepository.update).mockResolvedValue(
      draft({ acceptedStaleRecipe: true }),
    );

    await productionService.update('org-a', 'prd-1', { acceptedStaleRecipe: true }, 'user-1');

    expect(productRepository.getById).not.toHaveBeenCalled();
    expect(recipeRepository.getById).not.toHaveBeenCalled();
    expect(productRepository.getByIds).not.toHaveBeenCalled();
    expect(recipeRepository.getByIds).not.toHaveBeenCalled();
    expect(productionRepository.complete).not.toHaveBeenCalled();
    expect(productionRepository.update).toHaveBeenCalledWith(
      'org-a',
      'prd-1',
      expect.objectContaining({
        acceptedStaleRecipe: true,
        lines: undefined,
      }),
      'user-1',
    );
  });

  it('CASE C: reopening after Keep Current keeps acceptedStaleRecipe', async () => {
    vi.mocked(productionRepository.getById).mockResolvedValue(
      draft({ acceptedStaleRecipe: true }),
    );

    const reopened = await productionService.getById('org-a', 'prd-1');

    expect(reopened.status).toBe('draft');
    expect(reopened.acceptedStaleRecipe).toBe(true);
    expect(reopened.lines[0]?.recipeVersion).toBe(1);
    expect(reopened.lines[0]?.recipeIngredients?.[0]?.quantity).toBe(1);
    expect(productionRepository.complete).not.toHaveBeenCalled();
  });

  it('stores the V1 snapshot when the draft is created', async () => {
    vi.mocked(productRepository.getByIds).mockResolvedValue([product()]);
    vi.mocked(recipeRepository.getByIds).mockResolvedValue([recipe(1, 1)]);
    vi.mocked(productionRepository.create).mockResolvedValue(draft());

    await productionService.create(
      'org-a',
      {
        productionDate: '2026-08-16',
        lines: [{ productId: 'p-1', quantity: 10, unit: 'pcs' }],
      },
      'user-1',
    );

    expect(productionRepository.create).toHaveBeenCalledWith(
      'org-a',
      expect.objectContaining({
        productionDate: '2026-08-16',
        lines: [
          expect.objectContaining({
            recipeVersion: 1,
            recipeBatchOutputQuantity: 10,
            recipeIngredients: [
              expect.objectContaining({ rawMaterialId: 'rm-maida', quantity: 1, unit: 'kg' }),
            ],
          }),
        ],
      }),
      'user-1',
    );
    expect(vi.mocked(productionRepository.create).mock.calls[0]?.[1]).not.toHaveProperty(
      'productionNumber',
    );
    expect(productionRepository.complete).not.toHaveBeenCalled();
  });
});
