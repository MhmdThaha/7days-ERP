import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const completeMock = vi.fn();
const getByIdMock = vi.fn();
const markDirtyAfterCommitMock = vi.fn();
const scheduleRecalculationAfterCommitMock = vi.fn();
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
    markDirtyAfterCommit: (...args: unknown[]) => markDirtyAfterCommitMock(...args),
    scheduleRecalculationAfterCommit: (...args: unknown[]) =>
      scheduleRecalculationAfterCommitMock(...args),
    recalculateAfterMutation: (...args: unknown[]) => recalculateAfterMutationMock(...args),
    recalculate: (...args: unknown[]) => recalculateMock(...args),
  },
}));

import { saleService } from '@/lib/services/sale.service';

describe('saleService.complete daily summary scheduling', () => {
  beforeEach(() => {
    getByIdMock.mockReset();
    completeMock.mockReset();
    markDirtyAfterCommitMock.mockReset();
    scheduleRecalculationAfterCommitMock.mockReset();
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
    scheduleRecalculationAfterCommitMock.mockResolvedValue(undefined);
    markDirtyAfterCommitMock.mockResolvedValue(undefined);
  });

  it('returns the completed sale after inventory commit without calling the heavy rebuild directly', async () => {
    const completed = await saleService.complete('org-1', 'sale-1', 'user-1');

    expect(completed.status).toBe('completed');
    expect(completeMock).toHaveBeenCalledWith('org-1', 'sale-1', 'user-1');
    expect(scheduleRecalculationAfterCommitMock).toHaveBeenCalledWith('org-1', '2026-08-13');
    expect(recalculateAfterMutationMock).not.toHaveBeenCalled();
    expect(recalculateMock).not.toHaveBeenCalled();
  });

  it('keeps the sale completed when summary scheduling resolves after an internal failure', async () => {
    scheduleRecalculationAfterCommitMock.mockResolvedValue(undefined);

    await expect(saleService.complete('org-1', 'sale-1', 'user-1')).resolves.toMatchObject({
      id: 'sale-1',
      status: 'completed',
    });
    expect(completeMock).toHaveBeenCalledOnce();
  });

  it('schedules both same-day sales independently after each inventory commit', async () => {
    completeMock
      .mockResolvedValueOnce({
        id: 'sale-1',
        status: 'completed',
        saleDate: '2026-08-13',
      })
      .mockResolvedValueOnce({
        id: 'sale-2',
        status: 'completed',
        saleDate: '2026-08-13',
      });

    const first = await saleService.complete('org-1', 'sale-1', 'user-1');
    const second = await saleService.complete('org-1', 'sale-2', 'user-2');

    expect(first.status).toBe('completed');
    expect(second.status).toBe('completed');
    expect(scheduleRecalculationAfterCommitMock).toHaveBeenNthCalledWith(1, 'org-1', '2026-08-13');
    expect(scheduleRecalculationAfterCommitMock).toHaveBeenNthCalledWith(2, 'org-1', '2026-08-13');
    expect(recalculateAfterMutationMock).not.toHaveBeenCalled();
  });

  it('defers the heavy rebuild but still marks the sale date dirty after inventory commit', async () => {
    const completed = await saleService.complete('org-1', 'sale-1', 'user-1', {
      deferSummaryRebuild: true,
    });

    expect(completed.status).toBe('completed');
    expect(completeMock).toHaveBeenCalledWith('org-1', 'sale-1', 'user-1');
    expect(markDirtyAfterCommitMock).toHaveBeenCalledWith('org-1', '2026-08-13');
    expect(scheduleRecalculationAfterCommitMock).not.toHaveBeenCalled();
    expect(recalculateAfterMutationMock).not.toHaveBeenCalled();
  });

  it('keeps the sale completed when deferred dirty-marking resolves after an internal failure', async () => {
    markDirtyAfterCommitMock.mockResolvedValue(undefined);

    await expect(
      saleService.complete('org-1', 'sale-1', 'user-1', { deferSummaryRebuild: true }),
    ).resolves.toMatchObject({
      id: 'sale-1',
      status: 'completed',
    });
    expect(completeMock).toHaveBeenCalledOnce();
  });
});
