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
    create: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    complete: vi.fn(),
  },
  generateProductionLineId: vi.fn((() => {
    let n = 0;
    return () => `prl-${++n}`;
  })()),
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

function product(overrides: Partial<Product> = {}): Product {
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
    ...overrides,
  };
}

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'rec-1',
    organizationId: 'org-a',
    productId: 'p-1',
    recipeCode: 'R-1',
    recipeName: 'Cake Recipe',
    version: 1,
    batchOutputQuantity: 10,
    targetWeightGrams: null,
    ingredients: [
      { rawMaterialId: 'rm-maida', rawMaterialName: 'Maida', quantity: 1, unit: 'kg' },
    ],
    totalWeight: 1,
    notes: null,
    isActive: true,
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    createdBy: 'user-1',
    updatedAt: new Date('2026-08-16T00:00:00.000Z'),
    updatedBy: 'user-1',
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

function createdDraft(overrides: Partial<Production> = {}): Production {
  return {
    id: 'prd-1',
    organizationId: 'org-a',
    productionNumber: 'PRD-001',
    productionDate: '2026-08-16',
    status: 'draft',
    lines: [],
    totalUnits: 0,
    lineCount: 0,
    notes: null,
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

describe('productionService.create line resolution (batched reads)', () => {
  beforeEach(() => {
    vi.mocked(productionRepository.create).mockReset();
    vi.mocked(productRepository.getById).mockReset();
    vi.mocked(productRepository.getByIds).mockReset();
    vi.mocked(recipeRepository.getById).mockReset();
    vi.mocked(recipeRepository.getByIds).mockReset();
    vi.mocked(productionRepository.create).mockImplementation(async (_org, input) =>
      createdDraft({
        lines: input.lines,
        totalUnits: input.totalUnits,
        lineCount: input.lines.length,
      }),
    );
  });

  it('resolves one line with one product batch and one recipe batch', async () => {
    vi.mocked(productRepository.getByIds).mockResolvedValue([product()]);
    vi.mocked(recipeRepository.getByIds).mockResolvedValue([recipe()]);

    const created = await productionService.create(
      'org-a',
      {
        productionDate: '2026-08-16',
        lines: [{ id: 'prl-1', productId: 'p-1', quantity: 10, unit: 'pcs' }],
      },
      'user-1',
    );

    expect(productRepository.getById).not.toHaveBeenCalled();
    expect(recipeRepository.getById).not.toHaveBeenCalled();
    expect(productRepository.getByIds).toHaveBeenCalledTimes(1);
    expect(productRepository.getByIds).toHaveBeenCalledWith('org-a', ['p-1']);
    expect(recipeRepository.getByIds).toHaveBeenCalledTimes(1);
    expect(recipeRepository.getByIds).toHaveBeenCalledWith('org-a', ['rec-1']);
    expect(created.lines[0]).toMatchObject({
      quantity: 10,
      recipeVersion: 1,
      recipeBatchOutputQuantity: 10,
      recipeIngredients: [expect.objectContaining({ quantity: 1, unit: 'kg' })],
    });
    expect(productionRepository.complete).not.toHaveBeenCalled();
  });

  it('resolves three distinct lines with one product batch and one recipe batch', async () => {
    vi.mocked(productRepository.getByIds).mockResolvedValue([
      product({ id: 'p-1', name: 'Cake', activeRecipeId: 'rec-1' }),
      product({ id: 'p-2', name: 'Bread', code: 'BR-1', activeRecipeId: 'rec-2' }),
      product({ id: 'p-3', name: 'Bun', code: 'BN-1', activeRecipeId: 'rec-3' }),
    ]);
    vi.mocked(recipeRepository.getByIds).mockResolvedValue([
      recipe({ id: 'rec-1', productId: 'p-1', batchOutputQuantity: 10, ingredients: [
        { rawMaterialId: 'rm-maida', rawMaterialName: 'Maida', quantity: 1, unit: 'kg' },
      ] }),
      recipe({ id: 'rec-2', productId: 'p-2', recipeName: 'Bread Recipe', batchOutputQuantity: 20, ingredients: [
        { rawMaterialId: 'rm-maida', rawMaterialName: 'Maida', quantity: 2, unit: 'kg' },
      ] }),
      recipe({ id: 'rec-3', productId: 'p-3', recipeName: 'Bun Recipe', batchOutputQuantity: 12, ingredients: [
        { rawMaterialId: 'rm-sugar', rawMaterialName: 'Sugar', quantity: 0.5, unit: 'kg' },
      ] }),
    ]);

    const created = await productionService.create(
      'org-a',
      {
        productionDate: '2026-08-16',
        lines: [
          { id: 'l1', productId: 'p-1', quantity: 10, unit: 'pcs' },
          { id: 'l2', productId: 'p-2', quantity: 20, unit: 'pcs' },
          { id: 'l3', productId: 'p-3', quantity: 12, unit: 'pcs' },
        ],
      },
      'user-1',
    );

    expect(productRepository.getByIds).toHaveBeenCalledTimes(1);
    expect(recipeRepository.getByIds).toHaveBeenCalledTimes(1);
    expect(productRepository.getById).not.toHaveBeenCalled();
    expect(recipeRepository.getById).not.toHaveBeenCalled();
    expect(created.lines).toHaveLength(3);
    expect(created.lines[0]?.recipeIngredients?.[0]?.quantity).toBe(1);
    expect(created.lines[1]?.recipeIngredients?.[0]?.quantity).toBe(2);
    expect(created.lines[1]?.recipeBatchOutputQuantity).toBe(20);
    expect(created.lines[2]?.recipeIngredients?.[0]?.quantity).toBe(0.5);
    expect(created.totalUnits).toBe(42);
  });

  it('deduplicates product and recipe reads when two lines share the same product', async () => {
    vi.mocked(productRepository.getByIds).mockResolvedValue([product()]);
    vi.mocked(recipeRepository.getByIds).mockResolvedValue([recipe()]);

    await productionService.create(
      'org-a',
      {
        productionDate: '2026-08-16',
        lines: [
          { id: 'l1', productId: 'p-1', quantity: 10, unit: 'pcs' },
          { id: 'l2', productId: 'p-1', quantity: 5, unit: 'pcs' },
        ],
      },
      'user-1',
    );

    expect(productRepository.getByIds).toHaveBeenCalledWith('org-a', ['p-1']);
    expect(recipeRepository.getByIds).toHaveBeenCalledWith('org-a', ['rec-1']);
    expect(productRepository.getByIds).toHaveBeenCalledTimes(1);
    expect(recipeRepository.getByIds).toHaveBeenCalledTimes(1);
  });

  it('deduplicates recipe reads when two products share the same recipe id', async () => {
    vi.mocked(productRepository.getByIds).mockResolvedValue([
      product({ id: 'p-1', activeRecipeId: 'rec-shared' }),
      product({ id: 'p-2', name: 'Cake 2', code: 'CK-2', activeRecipeId: 'rec-shared' }),
    ]);
    vi.mocked(recipeRepository.getByIds).mockResolvedValue([
      recipe({ id: 'rec-shared', productId: 'p-1' }),
    ]);

    await expect(
      productionService.create(
        'org-a',
        {
          productionDate: '2026-08-16',
          lines: [
            { id: 'l1', productId: 'p-1', quantity: 10, unit: 'pcs' },
            { id: 'l2', productId: 'p-2', quantity: 5, unit: 'pcs' },
          ],
        },
        'user-1',
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Recipe does not match the selected product',
    });

    expect(recipeRepository.getByIds).toHaveBeenCalledWith('org-a', ['rec-shared']);
    expect(recipeRepository.getByIds).toHaveBeenCalledTimes(1);
  });

  it('throws the existing missing-product error', async () => {
    vi.mocked(productRepository.getByIds).mockResolvedValue([]);
    vi.mocked(recipeRepository.getByIds).mockResolvedValue([]);

    await expect(
      productionService.create(
        'org-a',
        {
          productionDate: '2026-08-16',
          lines: [{ id: 'l1', productId: 'missing', quantity: 10, unit: 'pcs' }],
        },
        'user-1',
      ),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'One or more products were not found',
    });

    expect(recipeRepository.getByIds).not.toHaveBeenCalled();
  });

  it('throws the existing missing-recipe error', async () => {
    vi.mocked(productRepository.getByIds).mockResolvedValue([product()]);
    vi.mocked(recipeRepository.getByIds).mockResolvedValue([]);

    await expect(
      productionService.create(
        'org-a',
        {
          productionDate: '2026-08-16',
          lines: [{ id: 'l1', productId: 'p-1', quantity: 10, unit: 'pcs' }],
        },
        'user-1',
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Product "Cake" does not have an active recipe',
    });
  });
});
