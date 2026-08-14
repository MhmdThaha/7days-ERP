import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/services/daily-summary.service', () => ({
  dailySummaryService: {
    getOrRecalculate: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/sale.repository', () => ({
  saleRepository: {
    list: vi.fn(),
    listCompletedByDate: vi.fn(),
    listCompletedByDateWithLines: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/expense.repository', () => ({
  expenseRepository: {
    list: vi.fn(),
    listCompletedByDate: vi.fn(),
    listCompletedByDateWithDetails: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/production.repository', () => ({
  productionRepository: {
    list: vi.fn(),
    listCompletedByDate: vi.fn(),
    listCompletedByDateWithLines: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/wastage.repository', () => ({
  wastageRepository: {
    list: vi.fn(),
    listCompletedByDate: vi.fn(),
    listCompletedByDateWithLines: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/return.repository', () => ({
  returnRepository: {
    list: vi.fn(),
    listCompletedByDate: vi.fn(),
    listCompletedByDateWithLines: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/inventory-movement.repository', () => ({
  inventoryMovementRepository: {
    listByDate: vi.fn(),
    sumTotalCostByMovementType: vi.fn(),
  },
}));

import { expenseRepository } from '@/lib/repositories/expense.repository';
import { inventoryMovementRepository } from '@/lib/repositories/inventory-movement.repository';
import { productionRepository } from '@/lib/repositories/production.repository';
import { returnRepository } from '@/lib/repositories/return.repository';
import { saleRepository } from '@/lib/repositories/sale.repository';
import { wastageRepository } from '@/lib/repositories/wastage.repository';
import { dailyBusinessStatementService } from '@/lib/services/daily-business-statement.service';
import { dailySummaryService } from '@/lib/services/daily-summary.service';

const date = '2026-08-10';

const emptySummary = {
  id: date,
  organizationId: 'org-1',
  summaryDate: date,
  isClosed: false,
  closedAt: null,
  closedBy: null,
  totalProductionUnits: 0,
  totalProductionCost: 250,
  totalSalesRevenue: 0,
  totalSalesDiscount: 0,
  totalNetSales: 0,
  totalCogs: 0,
  transactionCount: 0,
  totalPurchases: 80,
  totalExpenses: 0,
  expensesByCategory: {},
  totalWastageCost: 0,
  wastageCount: 0,
  grossProfit: 0,
  netProfit: 0,
  computedAt: new Date(),
  version: 1,
  needsRecalculation: false,
};

describe('dailyBusinessStatementService.getDailyBusinessStatement', () => {
  beforeEach(() => {
    vi.mocked(dailySummaryService.getOrRecalculate).mockReset();
    vi.mocked(saleRepository.listCompletedByDateWithLines).mockReset();
    vi.mocked(expenseRepository.listCompletedByDateWithDetails).mockReset();
    vi.mocked(productionRepository.listCompletedByDateWithLines).mockReset();
    vi.mocked(wastageRepository.listCompletedByDateWithLines).mockReset();
    vi.mocked(returnRepository.listCompletedByDateWithLines).mockReset();
    vi.mocked(saleRepository.list).mockReset();
    vi.mocked(expenseRepository.list).mockReset();
    vi.mocked(productionRepository.list).mockReset();
    vi.mocked(wastageRepository.list).mockReset();
    vi.mocked(returnRepository.list).mockReset();
    vi.mocked(inventoryMovementRepository.listByDate).mockReset();

    vi.mocked(dailySummaryService.getOrRecalculate).mockResolvedValue(emptySummary as never);
    vi.mocked(saleRepository.listCompletedByDateWithLines).mockResolvedValue([]);
    vi.mocked(expenseRepository.listCompletedByDateWithDetails).mockResolvedValue([]);
    vi.mocked(productionRepository.listCompletedByDateWithLines).mockResolvedValue([]);
    vi.mocked(wastageRepository.listCompletedByDateWithLines).mockResolvedValue([]);
    vi.mocked(returnRepository.listCompletedByDateWithLines).mockResolvedValue([]);
  });

  it('uses the requested date and org for every date-bounded query', async () => {
    const statement = await dailyBusinessStatementService.getDailyBusinessStatement('org-1', date);

    expect(dailySummaryService.getOrRecalculate).toHaveBeenCalledWith('org-1', date);
    expect(saleRepository.listCompletedByDateWithLines).toHaveBeenCalledWith('org-1', date);
    expect(expenseRepository.listCompletedByDateWithDetails).toHaveBeenCalledWith('org-1', date);
    expect(productionRepository.listCompletedByDateWithLines).toHaveBeenCalledWith('org-1', date);
    expect(wastageRepository.listCompletedByDateWithLines).toHaveBeenCalledWith('org-1', date);
    expect(returnRepository.listCompletedByDateWithLines).toHaveBeenCalledWith('org-1', date);
    expect(statement.reportDate).toBe(date);
    expect(statement.summary.totalPurchases).toBe(80);
  });

  it('never scans lifetime collections or inventory movements', async () => {
    await dailyBusinessStatementService.getDailyBusinessStatement('org-1', date);

    expect(saleRepository.list).not.toHaveBeenCalled();
    expect(expenseRepository.list).not.toHaveBeenCalled();
    expect(productionRepository.list).not.toHaveBeenCalled();
    expect(wastageRepository.list).not.toHaveBeenCalled();
    expect(returnRepository.list).not.toHaveBeenCalled();
    expect(saleRepository.listCompletedByDate).not.toHaveBeenCalled();
    expect(inventoryMovementRepository.listByDate).not.toHaveBeenCalled();
    expect(inventoryMovementRepository.sumTotalCostByMovementType).not.toHaveBeenCalled();
  });

  it('keeps organization isolation on the requested orgId', async () => {
    await dailyBusinessStatementService.getDailyBusinessStatement('org-a', date);

    expect(dailySummaryService.getOrRecalculate).toHaveBeenCalledWith('org-a', date);
    expect(saleRepository.listCompletedByDateWithLines).toHaveBeenCalledWith('org-a', date);
    expect(saleRepository.listCompletedByDateWithLines).not.toHaveBeenCalledWith('org-b', date);
  });

  it('rejects dates that are not YYYY-MM-DD', async () => {
    await expect(
      dailyBusinessStatementService.getDailyBusinessStatement('org-1', 'today'),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    expect(dailySummaryService.getOrRecalculate).not.toHaveBeenCalled();
  });
});

describe('date-bounded statement query sources', () => {
  it('does not introduce unbounded list() or N+1 getById in the statement service', () => {
    const source = readFileSync(resolve('src/lib/services/daily-business-statement.service.ts'), 'utf8');

    expect(source).toContain('listCompletedByDateWithLines');
    expect(source).toContain('listCompletedByDateWithDetails');
    expect(source).toContain('getOrRecalculate');
    expect(source).not.toMatch(/\.list\(/);
    expect(source).not.toMatch(/getById/);
    expect(source).not.toMatch(/inventoryMovement/);
    expect(source).not.toMatch(/getDateStringInTimezone/);
  });
});
