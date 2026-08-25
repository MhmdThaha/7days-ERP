import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const scheduledTasks: Array<() => Promise<void>> = [];
const scheduleAfterResponseMock = vi.fn((task: () => Promise<void>) => {
  scheduledTasks.push(task);
  return true;
});

vi.mock('@/lib/server/schedule-after-response', () => ({
  scheduleAfterResponse: (task: () => Promise<void>) => scheduleAfterResponseMock(task),
}));

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
  saleRepository: {
    listCompletedByDate: vi.fn(),
    listCompletedByDateWithLines: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/return.repository', () => ({
  returnRepository: { listCompletedByDateWithLines: vi.fn() },
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

import { aggregateDailySummaries } from '@/lib/domain/calculations/summary-aggregation';
import {
  DailySummaryVersionConflictError,
  dailySummaryRepository,
} from '@/lib/repositories/daily-summary.repository';
import { expenseRepository } from '@/lib/repositories/expense.repository';
import { inventoryMovementRepository } from '@/lib/repositories/inventory-movement.repository';
import { productionRepository } from '@/lib/repositories/production.repository';
import { purchaseRepository } from '@/lib/repositories/purchase.repository';
import { returnRepository } from '@/lib/repositories/return.repository';
import { saleRepository } from '@/lib/repositories/sale.repository';
import { wastageRepository } from '@/lib/repositories/wastage.repository';
import { dailySummaryService } from '@/lib/services/daily-summary.service';
import type { DailySummary } from '@/types/daily-summary';
import type { ReturnEntry } from '@/types/return';
import type { Sale } from '@/types/sale';

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
  vi.mocked(saleRepository.listCompletedByDateWithLines).mockResolvedValue([
    {
      id: 'sale-1',
      organizationId: 'org-1',
      saleNumber: 'SAL-001',
      saleDate: date,
      customerId: null,
      customerNameSnapshot: null,
      status: 'completed',
      lines: [
        {
          id: 'sl-1',
          productId: 'bread',
          productNameSnapshot: 'Bread',
          productCodeSnapshot: 'BRD',
          sellingPriceSnapshot: 100,
          quantity: 1,
          unit: 'pcs',
          lineTotal: 100,
          unitCost: 40,
          cogs: 40,
        },
      ],
      subtotal: 100,
      totalCogs: 40,
      lineCount: 1,
      notes: null,
      createdAt: new Date(),
      createdBy: 'u1',
      updatedAt: new Date(),
      updatedBy: 'u1',
      completedAt: new Date(),
      completedBy: 'u1',
      deletedAt: null,
      deletedBy: null,
    },
  ]);
  vi.mocked(returnRepository.listCompletedByDateWithLines).mockResolvedValue([]);
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
    scheduledTasks.length = 0;
    scheduleAfterResponseMock.mockReset();
    scheduleAfterResponseMock.mockImplementation((task: () => Promise<void>) => {
      scheduledTasks.push(task);
      return true;
    });
    stubRecalculateSources();
  });

  it('returns an existing clean summary without recalculating', async () => {
    const existing = summary();
    vi.mocked(dailySummaryRepository.getByDate).mockResolvedValue(existing);

    const result = await dailySummaryService.getOrRecalculate('org-1', date);

    expect(result).toBe(existing);
    expect(saleRepository.listCompletedByDateWithLines).not.toHaveBeenCalled();
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

    expect(saleRepository.listCompletedByDateWithLines).toHaveBeenCalledTimes(2);
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

  it('getOrRecalculate rebuilds a dirty production total before returning it', async () => {
    vi.mocked(dailySummaryRepository.getByDate).mockResolvedValue(
      summary({ needsRecalculation: true, totalProductionUnits: 100, version: 1 }),
    );
    vi.mocked(productionRepository.listCompletedByDate).mockResolvedValue([
      { totalUnits: 100 },
      { totalUnits: 50 },
    ] as never);
    vi.mocked(dailySummaryRepository.upsertIfVersionMatches).mockResolvedValue(
      summary({
        version: 2,
        needsRecalculation: false,
        totalProductionUnits: 150,
      }),
    );

    const result = await dailySummaryService.getOrRecalculate('org-1', date);

    expect(result.totalProductionUnits).toBe(150);
    expect(result.needsRecalculation).toBe(false);
    expect(dailySummaryRepository.upsertIfVersionMatches).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ totalProductionUnits: 150 }),
      1,
    );
  });

  it('scheduleRecalculationAfterCommit marks dirty and returns without waiting for rebuild', async () => {
    let rebuildFinished = false;
    vi.mocked(dailySummaryRepository.markNeedsRecalculation).mockResolvedValue();
    vi.spyOn(dailySummaryService, 'recalculateAfterMutation').mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            rebuildFinished = true;
            resolve();
          }, 50);
        }),
    );

    await dailySummaryService.scheduleRecalculationAfterCommit('org-1', date);

    expect(rebuildFinished).toBe(false);
    expect(dailySummaryRepository.markNeedsRecalculation).toHaveBeenCalledWith('org-1', date);
    expect(scheduleAfterResponseMock).toHaveBeenCalledOnce();
    expect(dailySummaryService.recalculateAfterMutation).not.toHaveBeenCalled();

    const scheduledTask = scheduledTasks[0];
    if (!scheduledTask) {
      throw new Error('expected after() task to be registered');
    }
    await scheduledTask();

    expect(rebuildFinished).toBe(true);
    expect(dailySummaryService.recalculateAfterMutation).toHaveBeenCalledWith('org-1', date);
  });

  it('scheduleRecalculationAfterCommit awaits rebuild when after() cannot be scheduled', async () => {
    scheduleAfterResponseMock.mockImplementation(() => false);
    vi.mocked(dailySummaryRepository.markNeedsRecalculation).mockResolvedValue();
    const recalcSpy = vi.spyOn(dailySummaryService, 'recalculateAfterMutation').mockResolvedValue();

    await dailySummaryService.scheduleRecalculationAfterCommit('org-1', date);

    expect(recalcSpy).toHaveBeenCalledWith('org-1', date);
  });

  it('scheduleRecalculationAfterCommit falls back to rebuild when mark dirty fails', async () => {
    vi.mocked(dailySummaryRepository.markNeedsRecalculation).mockRejectedValue(
      new Error('mark failed'),
    );
    const recalcSpy = vi.spyOn(dailySummaryService, 'recalculateAfterMutation').mockResolvedValue();

    await dailySummaryService.scheduleRecalculationAfterCommit('org-1', date);

    expect(recalcSpy).toHaveBeenCalledWith('org-1', date);
    expect(scheduleAfterResponseMock).not.toHaveBeenCalled();
  });

  it('two overlapping schedules both mark dirty and both queue a rebuild', async () => {
    vi.mocked(dailySummaryRepository.markNeedsRecalculation).mockResolvedValue();

    await Promise.all([
      dailySummaryService.scheduleRecalculationAfterCommit('org-1', date),
      dailySummaryService.scheduleRecalculationAfterCommit('org-1', date),
    ]);

    expect(dailySummaryRepository.markNeedsRecalculation).toHaveBeenCalledTimes(2);
    expect(scheduleAfterResponseMock).toHaveBeenCalledTimes(2);
  });

  it('markDirtyAfterCommit marks the day dirty without scheduling a rebuild', async () => {
    vi.mocked(dailySummaryRepository.markNeedsRecalculation).mockResolvedValue();
    const recalcSpy = vi.spyOn(dailySummaryService, 'recalculateAfterMutation').mockResolvedValue();

    await dailySummaryService.markDirtyAfterCommit('org-1', date);

    expect(dailySummaryRepository.markNeedsRecalculation).toHaveBeenCalledWith('org-1', date);
    expect(scheduleAfterResponseMock).not.toHaveBeenCalled();
    expect(recalcSpy).not.toHaveBeenCalled();
  });

  it('markDirtyAfterCommit falls back to rebuild when mark dirty fails and does not throw', async () => {
    vi.mocked(dailySummaryRepository.markNeedsRecalculation).mockRejectedValue(
      new Error('mark failed'),
    );
    const recalcSpy = vi.spyOn(dailySummaryService, 'recalculateAfterMutation').mockResolvedValue();

    await expect(dailySummaryService.markDirtyAfterCommit('org-1', date)).resolves.toBeUndefined();
    expect(recalcSpy).toHaveBeenCalledWith('org-1', date);
    expect(scheduleAfterResponseMock).not.toHaveBeenCalled();
  });
});

function completedSaleForReturnTest(quantity: number, sellingPrice: number, unitCost: number): Sale {
  const lineTotal = quantity * sellingPrice;
  const cogs = quantity * unitCost;

  return {
    id: 'sale-1',
    organizationId: 'org-1',
    saleNumber: 'SAL-001',
    saleDate: date,
    customerId: null,
    customerNameSnapshot: null,
    status: 'completed',
    lines: [
      {
        id: 'sl-1',
        productId: 'bread',
        productNameSnapshot: 'Bread',
        productCodeSnapshot: 'BRD',
        sellingPriceSnapshot: sellingPrice,
        quantity,
        unit: 'pcs',
        lineTotal,
        unitCost,
        cogs,
      },
    ],
    subtotal: lineTotal,
    totalCogs: cogs,
    lineCount: 1,
    notes: null,
    createdAt: new Date(),
    createdBy: 'u1',
    updatedAt: new Date(),
    updatedBy: 'u1',
    completedAt: new Date(),
    completedBy: 'u1',
    deletedAt: null,
    deletedBy: null,
  };
}

function completedReturnForTest(
  quantity: number,
  options?: { linked?: boolean; sellingPrice?: number },
): ReturnEntry {
  const linked = options?.linked ?? false;
  const sellingPrice = options?.sellingPrice ?? 500;

  return {
    id: 'ret-1',
    organizationId: 'org-1',
    returnNumber: 'RET-001',
    returnDate: date,
    reason: 'unsold',
    status: 'completed',
    sourceSaleId: linked ? 'sale-1' : null,
    sourceSaleNumberSnapshot: linked ? 'SAL-001' : null,
    lines: [
      {
        id: 'rl-1',
        saleLineId: linked ? 'sl-1' : null,
        productId: 'bread',
        productNameSnapshot: 'Bread',
        productCodeSnapshot: 'BRD',
        quantity,
        unit: 'pcs',
        sellingPriceSnapshot: linked ? sellingPrice : null,
        unitCostSnapshot: linked ? 400 : null,
      },
    ],
    lineCount: 1,
    totalUnits: quantity,
    notes: null,
    createdAt: new Date(),
    createdBy: 'u1',
    updatedAt: new Date(),
    updatedBy: 'u1',
    completedAt: new Date(),
    completedBy: 'u1',
    deletedAt: null,
    deletedBy: null,
  };
}

describe('dailySummaryService recalculate with returns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dailySummaryRepository.getByDate).mockResolvedValue(null);
    vi.mocked(dailySummaryRepository.upsertIfVersionMatches).mockImplementation(
      async (_orgId, input) => ({
        id: date,
        organizationId: 'org-1',
        summaryDate: date,
        isClosed: false,
        closedAt: null,
        closedBy: null,
        totalProductionUnits: 0,
        totalProductionCost: 0,
        totalSalesRevenue: input.totalSalesRevenue,
        totalSalesDiscount: 0,
        totalNetSales: input.totalNetSales,
        totalCogs: input.totalCogs,
        transactionCount: input.transactionCount,
        totalPurchases: 0,
        totalExpenses: 0,
        expensesByCategory: {},
        totalWastageCost: 0,
        wastageCount: 0,
        grossProfit: input.grossProfit,
        netProfit: input.netProfit,
        computedAt: new Date(),
        version: 1,
        needsRecalculation: false,
      }),
    );
    vi.mocked(expenseRepository.listCompletedByDate).mockResolvedValue([]);
    vi.mocked(productionRepository.listCompletedByDate).mockResolvedValue([]);
    vi.mocked(wastageRepository.listCompletedByDate).mockResolvedValue([]);
    vi.mocked(purchaseRepository.listReceivedByDate).mockResolvedValue([]);
  });

  it('full return zeroes net sales and COGS for the day', async () => {
    vi.mocked(saleRepository.listCompletedByDateWithLines).mockResolvedValue([
      completedSaleForReturnTest(10, 500, 400),
    ]);
    vi.mocked(returnRepository.listCompletedByDateWithLines).mockResolvedValue([
      completedReturnForTest(10),
    ]);
    vi.mocked(inventoryMovementRepository.sumTotalCostByMovementType).mockImplementation(
      async (_orgId, _date, movementType) => (movementType === 'RETURN_IN' ? 4000 : 0),
    );

    const result = await dailySummaryService.recalculate('org-1', date);

    expect(result.totalSalesRevenue).toBe(5000);
    expect(result.totalNetSales).toBe(0);
    expect(result.totalCogs).toBe(0);
    expect(result.grossProfit).toBe(0);
  });

  it('partial return reduces net sales and COGS without overstating profit', async () => {
    vi.mocked(saleRepository.listCompletedByDateWithLines).mockResolvedValue([
      completedSaleForReturnTest(10, 500, 400),
    ]);
    vi.mocked(returnRepository.listCompletedByDateWithLines).mockResolvedValue([
      completedReturnForTest(4),
    ]);
    vi.mocked(inventoryMovementRepository.sumTotalCostByMovementType).mockImplementation(
      async (_orgId, _date, movementType) => (movementType === 'RETURN_IN' ? 1600 : 0),
    );

    const result = await dailySummaryService.recalculate('org-1', date);

    expect(result.totalSalesRevenue).toBe(5000);
    expect(result.totalNetSales).toBe(3000);
    expect(result.totalCogs).toBe(2400);
    expect(result.grossProfit).toBe(600);
  });

  it('linked cross-day return produces negative net sales when gross sales are zero', async () => {
    vi.mocked(saleRepository.listCompletedByDateWithLines).mockResolvedValue([]);
    vi.mocked(returnRepository.listCompletedByDateWithLines).mockResolvedValue([
      completedReturnForTest(3, { linked: true, sellingPrice: 4000 }),
    ]);
    vi.mocked(inventoryMovementRepository.sumTotalCostByMovementType).mockImplementation(
      async (_orgId, _date, movementType) => (movementType === 'RETURN_IN' ? 7500 : 0),
    );

    const result = await dailySummaryService.recalculate('org-1', date);

    expect(result.totalSalesRevenue).toBe(0);
    expect(result.totalNetSales).toBe(-12000);
    expect(result.grossProfit).toBe(-12000);
  });

  it('monthly aggregation uses return-adjusted daily summaries', () => {
    const monthSummaries = aggregateDailySummaries([
      {
        totalNetSales: 3000,
        totalCogs: 2400,
        grossProfit: 600,
        totalExpenses: 0,
        totalWastageCost: 0,
        netProfit: 600,
        transactionCount: 1,
      },
    ]);

    expect(monthSummaries.netSales).toBe(3000);
    expect(monthSummaries.grossProfit).toBe(600);
    expect(monthSummaries.netProfit).toBe(600);
  });
});
