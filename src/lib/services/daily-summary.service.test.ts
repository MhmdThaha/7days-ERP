import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/repositories/daily-summary.repository', async () => {
  const actual = await vi.importActual<typeof import('@/lib/repositories/daily-summary.repository')>(
    '@/lib/repositories/daily-summary.repository',
  );

  return {
    ...actual,
    dailySummaryRepository: {
      getByDate: vi.fn(),
      listByMonth: vi.fn(),
      upsertIfVersionMatches: vi.fn(),
      markNeedsRecalculation: vi.fn(),
    },
  };
});

vi.mock('@/lib/repositories/sale.repository', () => ({
  saleRepository: { listCompletedByDate: vi.fn() },
}));

vi.mock('@/lib/repositories/expense.repository', () => ({
  expenseRepository: { listCompletedByDate: vi.fn() },
}));

vi.mock('@/lib/repositories/production.repository', () => ({
  productionRepository: { listCompletedByDate: vi.fn() },
}));

vi.mock('@/lib/repositories/wastage.repository', () => ({
  wastageRepository: { listCompletedByDate: vi.fn() },
}));

vi.mock('@/lib/repositories/purchase.repository', () => ({
  purchaseRepository: { listReceivedByDate: vi.fn() },
}));

vi.mock('@/lib/repositories/inventory-movement.repository', () => ({
  inventoryMovementRepository: { sumTotalCostByMovementType: vi.fn() },
}));

import {
  DailySummaryVersionConflictError,
  dailySummaryRepository,
} from '@/lib/repositories/daily-summary.repository';
import { expenseRepository } from '@/lib/repositories/expense.repository';
import { inventoryMovementRepository } from '@/lib/repositories/inventory-movement.repository';
import { productionRepository } from '@/lib/repositories/production.repository';
import { purchaseRepository } from '@/lib/repositories/purchase.repository';
import { saleRepository } from '@/lib/repositories/sale.repository';
import { wastageRepository } from '@/lib/repositories/wastage.repository';
import { dailySummaryService } from '@/lib/services/daily-summary.service';
import type { DailySummary } from '@/types/daily-summary';

const date = '2026-08-13';

function summary(overrides: Partial<DailySummary> = {}): DailySummary {
  return {
    id: date,
    organizationId: 'org-1',
    summaryDate: date,
    isClosed: false,
    closedAt: null,
    closedBy: null,
    totalProductionUnits: 0,
    totalProductionCost: 0,
    totalSalesRevenue: 100,
    totalSalesDiscount: 0,
    totalNetSales: 100,
    totalCogs: 40,
    transactionCount: 1,
    totalPurchases: 0,
    totalExpenses: 0,
    expensesByCategory: {},
    totalWastageCost: 0,
    wastageCount: 0,
    grossProfit: 60,
    netProfit: 60,
    computedAt: new Date('2026-08-13T08:00:00.000Z'),
    version: 1,
    needsRecalculation: false,
    ...overrides,
  };
}

function stubRecalculateSources(): void {
  vi.mocked(saleRepository.listCompletedByDate).mockResolvedValue([
    {
      id: 'sale-1',
      saleNumber: 'SAL-001',
      saleDate: date,
      customerNameSnapshot: null,
      lineCount: 1,
      subtotal: 100,
      totalCogs: 40,
      status: 'completed',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  vi.mocked(expenseRepository.listCompletedByDate).mockResolvedValue([]);
  vi.mocked(productionRepository.listCompletedByDate).mockResolvedValue([]);
  vi.mocked(wastageRepository.listCompletedByDate).mockResolvedValue([]);
  vi.mocked(purchaseRepository.listReceivedByDate).mockResolvedValue([]);
  vi.mocked(inventoryMovementRepository.sumTotalCostByMovementType).mockResolvedValue(0);
}

describe('dailySummaryService recalculation reliability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    stubRecalculateSources();
  });

  it('returns an existing clean summary without recalculating', async () => {
    const existing = summary();
    vi.mocked(dailySummaryRepository.getByDate).mockResolvedValue(existing);

    const result = await dailySummaryService.getOrRecalculate('org-1', date);

    expect(result).toBe(existing);
    expect(saleRepository.listCompletedByDate).not.toHaveBeenCalled();
  });

  it('A: normal recalculation still works', async () => {
    vi.mocked(dailySummaryRepository.getByDate).mockResolvedValue(null);
    vi.mocked(dailySummaryRepository.upsertIfVersionMatches).mockResolvedValue(
      summary({ version: 1, needsRecalculation: false }),
    );

    const result = await dailySummaryService.recalculate('org-1', date);

    expect(dailySummaryRepository.upsertIfVersionMatches).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ totalNetSales: 100, totalCogs: 40 }),
      0,
    );
    expect(result.version).toBe(1);
    expect(result.needsRecalculation).toBe(false);
  });

  it('recalculates when the existing summary is marked needsRecalculation', async () => {
    vi.mocked(dailySummaryRepository.getByDate).mockResolvedValue(
      summary({ needsRecalculation: true, totalNetSales: 0, netProfit: 0, version: 2 }),
    );
    vi.mocked(dailySummaryRepository.upsertIfVersionMatches).mockResolvedValue(
      summary({ version: 3, totalNetSales: 100 }),
    );

    const result = await dailySummaryService.getOrRecalculate('org-1', date);

    expect(dailySummaryRepository.upsertIfVersionMatches).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ totalNetSales: 100 }),
      2,
    );
    expect(result.totalNetSales).toBe(100);
  });

  it('C: version conflict retries with a fresh source read', async () => {
    vi.mocked(dailySummaryRepository.getByDate)
      .mockResolvedValueOnce(summary({ version: 1 }))
      .mockResolvedValueOnce(summary({ version: 2 }));

    vi.mocked(dailySummaryRepository.upsertIfVersionMatches)
      .mockRejectedValueOnce(new DailySummaryVersionConflictError())
      .mockResolvedValueOnce(summary({ version: 3, totalNetSales: 100 }));

    const result = await dailySummaryService.recalculate('org-1', date);

    expect(saleRepository.listCompletedByDate).toHaveBeenCalledTimes(2);
    expect(dailySummaryRepository.upsertIfVersionMatches).toHaveBeenNthCalledWith(
      1,
      'org-1',
      expect.anything(),
      1,
    );
    expect(dailySummaryRepository.upsertIfVersionMatches).toHaveBeenNthCalledWith(
      2,
      'org-1',
      expect.anything(),
      2,
    );
    expect(result.version).toBe(3);
  });

  it('B: conflict path never writes when upsertIfVersionMatches rejects', async () => {
    vi.mocked(dailySummaryRepository.getByDate).mockResolvedValue(summary({ version: 4 }));
    vi.mocked(dailySummaryRepository.upsertIfVersionMatches).mockRejectedValue(
      new DailySummaryVersionConflictError(),
    );

    await expect(dailySummaryService.recalculate('org-1', date)).rejects.toBeInstanceOf(
      DailySummaryVersionConflictError,
    );

    expect(dailySummaryRepository.upsertIfVersionMatches).toHaveBeenCalledTimes(3);
    expect(dailySummaryRepository.upsertIfVersionMatches).toHaveBeenCalledWith(
      'org-1',
      expect.anything(),
      4,
    );
  });

  it('D: exhausted retries mark the summary for recalculation via recalculateAfterMutation', async () => {
    vi.mocked(dailySummaryRepository.getByDate).mockResolvedValue(summary({ version: 1 }));
    vi.mocked(dailySummaryRepository.upsertIfVersionMatches).mockRejectedValue(
      new DailySummaryVersionConflictError(),
    );
    vi.mocked(dailySummaryRepository.markNeedsRecalculation).mockResolvedValue();

    await expect(
      dailySummaryService.recalculateAfterMutation('org-1', date),
    ).resolves.toBeUndefined();

    expect(dailySummaryRepository.upsertIfVersionMatches).toHaveBeenCalledTimes(3);
    expect(dailySummaryRepository.markNeedsRecalculation).toHaveBeenCalledWith('org-1', date);
  });

  it('recalculateAfterMutation swallows generic recalculate failures and marks dirty', async () => {
    vi.spyOn(dailySummaryService, 'recalculate').mockRejectedValue(new Error('firestore timeout'));
    vi.mocked(dailySummaryRepository.markNeedsRecalculation).mockResolvedValue();

    await expect(
      dailySummaryService.recalculateAfterMutation('org-1', date),
    ).resolves.toBeUndefined();

    expect(dailySummaryRepository.markNeedsRecalculation).toHaveBeenCalledWith('org-1', date);
  });

  it('successful recalculateAfterMutation does not mark dirty', async () => {
    vi.mocked(dailySummaryRepository.getByDate).mockResolvedValue(null);
    vi.mocked(dailySummaryRepository.upsertIfVersionMatches).mockResolvedValue(
      summary({ version: 1 }),
    );

    await dailySummaryService.recalculateAfterMutation('org-1', date);

    expect(dailySummaryRepository.upsertIfVersionMatches).toHaveBeenCalled();
    expect(dailySummaryRepository.markNeedsRecalculation).not.toHaveBeenCalled();
  });
});
