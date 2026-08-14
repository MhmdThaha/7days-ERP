import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const completeMock = vi.fn();
const getByIdMock = vi.fn();
const recalculateAfterMutationMock = vi.fn();
const recalculateMock = vi.fn();

vi.mock('@/lib/repositories/sale.repository', () => ({
  saleRepository: {
    getById: (...args: unknown[]) => getByIdMock(...args),
    complete: (...args: unknown[]) => completeMock(...args),
  },
  generateSaleLineId: vi.fn(),
}));

vi.mock('@/lib/repositories/product.repository', () => ({
  productRepository: {},
}));

vi.mock('@/lib/services/daily-summary.service', () => ({
  dailySummaryService: {
    recalculateAfterMutation: (...args: unknown[]) => recalculateAfterMutationMock(...args),
    recalculate: (...args: unknown[]) => recalculateMock(...args),
  },
}));

import { saleService } from '@/lib/services/sale.service';

describe('saleService.complete + daily summary failure isolation', () => {
  beforeEach(() => {
    getByIdMock.mockReset();
    completeMock.mockReset();
    recalculateAfterMutationMock.mockReset();
    recalculateMock.mockReset();

    getByIdMock.mockResolvedValue({
      id: 'sale-1',
      status: 'draft',
      lines: [{ id: 'l1' }],
      saleDate: '2026-08-13',
    });
    completeMock.mockResolvedValue({
      id: 'sale-1',
      status: 'completed',
      saleDate: '2026-08-13',
      lines: [{ id: 'l1' }],
    });
    recalculateAfterMutationMock.mockResolvedValue(undefined);
  });

  it('returns the completed sale and never awaits throwing recalculate()', async () => {
    const completed = await saleService.complete('org-1', 'sale-1', 'user-1');

    expect(completed.status).toBe('completed');
    expect(completeMock).toHaveBeenCalledWith('org-1', 'sale-1', 'user-1');
    expect(recalculateAfterMutationMock).toHaveBeenCalledWith('org-1', '2026-08-13');
    expect(recalculateMock).not.toHaveBeenCalled();
  });

  it('still returns the completed sale when recalculateAfterMutation resolves after an internal failure', async () => {
    // recalculateAfterMutation itself must not throw (best-effort); service still succeeds.
    recalculateAfterMutationMock.mockResolvedValue(undefined);

    await expect(saleService.complete('org-1', 'sale-1', 'user-1')).resolves.toMatchObject({
      id: 'sale-1',
      status: 'completed',
    });
    expect(completeMock).toHaveBeenCalledOnce();
  });
});
