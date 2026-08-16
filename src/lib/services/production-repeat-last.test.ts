import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const getLatestForRepeatMock = vi.fn();
const listMock = vi.fn();
const listPageMock = vi.fn();

vi.mock('@/lib/repositories/production.repository', () => ({
  productionRepository: {
    getLatestForRepeat: (...args: unknown[]) => getLatestForRepeatMock(...args),
    list: (...args: unknown[]) => listMock(...args),
    listPage: (...args: unknown[]) => listPageMock(...args),
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

import { productionService } from '@/lib/services/production.service';

describe('productionService.getLatestForRepeat', () => {
  beforeEach(() => {
    getLatestForRepeatMock.mockReset();
    listMock.mockReset();
    listPageMock.mockReset();
    getLatestForRepeatMock.mockResolvedValue({
      id: 'prd-10',
      productionNumber: 'PRD-010',
      productionDate: '2026-08-16',
    });
  });

  it('uses getLatestForRepeat and never the full list() or listPage()', async () => {
    const result = await productionService.getLatestForRepeat('org-a');

    expect(result).toMatchObject({ id: 'prd-10', productionNumber: 'PRD-010' });
    expect(getLatestForRepeatMock).toHaveBeenCalledWith('org-a');
    expect(listMock).not.toHaveBeenCalled();
    expect(listPageMock).not.toHaveBeenCalled();
  });
});

describe('Repeat Last UI wiring', () => {
  it('does not call listProductionsAction or listPage from the create page', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/production/production-create-page.tsx'),
      'utf8',
    );

    expect(source).toContain('getLatestProductionForRepeatAction');
    expect(source).toContain('getProductionAction');
    expect(source).toContain('toRepeatLastFormLines');
    expect(source).not.toContain('listProductionsAction');
    expect(source).not.toContain('listProductionsPageAction');
  });
});
