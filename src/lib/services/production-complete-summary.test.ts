import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const completeMock = vi.fn();
const scheduleRecalculationAfterCommitMock = vi.fn();
const recalculateAfterMutationMock = vi.fn();

vi.mock('@/lib/repositories/production.repository', () => ({
  productionRepository: {
    complete: (...args: unknown[]) => completeMock(...args),
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
  dailySummaryService: {
    scheduleRecalculationAfterCommit: (...args: unknown[]) =>
      scheduleRecalculationAfterCommitMock(...args),
    recalculateAfterMutation: (...args: unknown[]) => recalculateAfterMutationMock(...args),
  },
}));

import { productionService } from '@/lib/services/production.service';

describe('productionService.complete daily summary scheduling', () => {
  beforeEach(() => {
    completeMock.mockReset();
    scheduleRecalculationAfterCommitMock.mockReset();
    recalculateAfterMutationMock.mockReset();

    completeMock.mockResolvedValue({
      id: 'prd-1',
      status: 'completed',
      productionDate: '2026-08-13',
      totalUnits: 50,
    });
    scheduleRecalculationAfterCommitMock.mockResolvedValue(undefined);
  });

  it('returns completed production after inventory commit without calling the heavy rebuild directly', async () => {
    const completed = await productionService.complete('org-1', 'prd-1', 'user-1');

    expect(completed.status).toBe('completed');
    expect(completeMock).toHaveBeenCalledWith('org-1', 'prd-1', 'user-1');
    expect(scheduleRecalculationAfterCommitMock).toHaveBeenCalledWith('org-1', '2026-08-13');
    expect(recalculateAfterMutationMock).not.toHaveBeenCalled();
  });

  it('keeps production completed when summary scheduling resolves after an internal failure', async () => {
    scheduleRecalculationAfterCommitMock.mockResolvedValue(undefined);

    await expect(productionService.complete('org-1', 'prd-1', 'user-1')).resolves.toMatchObject({
      id: 'prd-1',
      status: 'completed',
    });
    expect(completeMock).toHaveBeenCalledOnce();
  });
});
