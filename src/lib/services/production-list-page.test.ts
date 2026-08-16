import { beforeEach, describe, expect, it, vi } from 'vitest';

import { productionRepository } from '@/lib/repositories/production.repository';
import { productionService } from '@/lib/services/production.service';
import type { ProductionListItem, ProductionListPageResult, ProductionListResult } from '@/types/production';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/repositories/production.repository', () => ({
  productionRepository: {
    list: vi.fn(),
    listPage: vi.fn(),
  },
  generateProductionLineId: vi.fn(),
}));

vi.mock('@/lib/repositories/product.repository', () => ({
  productRepository: {},
}));

vi.mock('@/lib/repositories/recipe.repository', () => ({
  recipeRepository: {},
}));

vi.mock('@/lib/services/daily-summary.service', () => ({
  dailySummaryService: {},
}));

function listItem(
  overrides: Partial<ProductionListItem> &
    Pick<ProductionListItem, 'id' | 'productionNumber' | 'productionDate'>,
): ProductionListItem {
  return {
    lineCount: overrides.lineCount ?? 1,
    totalUnits: overrides.totalUnits ?? 10,
    status: overrides.status ?? 'completed',
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
    id: overrides.id,
    productionNumber: overrides.productionNumber,
    productionDate: overrides.productionDate,
  };
}

describe('productionService.listPage', () => {
  beforeEach(() => {
    vi.mocked(productionRepository.list).mockReset();
    vi.mocked(productionRepository.listPage).mockReset();
  });

  it('uses legacy list() for non-empty substring search', async () => {
    const legacy: ProductionListResult = {
      items: [listItem({ id: 'p1', productionNumber: 'PRD-010', productionDate: '2026-08-01' })],
      total: 1,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    };
    vi.mocked(productionRepository.list).mockResolvedValue(legacy);

    const result = await productionService.listPage('org-a', {
      search: 'prd-010',
      status: 'all',
      page: 1,
      pageSize: 25,
      position: 'first',
    });

    expect(productionRepository.list).toHaveBeenCalledWith('org-a', {
      search: 'prd-010',
      status: 'all',
      page: 1,
      pageSize: 25,
    });
    expect(productionRepository.listPage).not.toHaveBeenCalled();
    expect(result.items.map((item) => item.id)).toEqual(['p1']);
    expect(result.startCursor).toEqual({
      productionDate: '2026-08-01',
      productionNumber: 'PRD-010',
    });
  });

  it('uses listPage for empty search', async () => {
    const pageResult: ProductionListPageResult = {
      items: [listItem({ id: 'p2', productionNumber: 'PRD-020', productionDate: '2026-08-02' })],
      total: 1,
      page: 1,
      pageSize: 25,
      totalPages: 1,
      startCursor: { productionDate: '2026-08-02', productionNumber: 'PRD-020' },
      endCursor: { productionDate: '2026-08-02', productionNumber: 'PRD-020' },
    };
    vi.mocked(productionRepository.listPage).mockResolvedValue(pageResult);

    const result = await productionService.listPage('org-a', {
      search: '  ',
      status: 'draft',
      page: 1,
      pageSize: 25,
      position: 'first',
    });

    expect(productionRepository.list).not.toHaveBeenCalled();
    expect(productionRepository.listPage).toHaveBeenCalledWith('org-a', {
      status: 'draft',
      pageSize: 25,
      page: 1,
      position: 'first',
      cursor: undefined,
    });
    expect(result).toEqual(pageResult);
  });
});
