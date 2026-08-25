import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  },
}));

vi.mock('@/lib/repositories/expense.repository', () => ({
  expenseRepository: {
    list: vi.fn(),
    listCompletedByDate: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/production.repository', () => ({
  productionRepository: {
    list: vi.fn(),
    listCompletedByDate: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/wastage.repository', () => ({
  wastageRepository: {
    list: vi.fn(),
    listCompletedByDate: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/return.repository', () => ({
  returnRepository: {
    list: vi.fn(),
    listCompletedByDate: vi.fn(),
  },
}));

vi.mock('@/lib/domain/calculations/daily-operations', () => ({
  buildDailySummaryAlerts: vi.fn(() => []),
  buildDailySummaryQuickSummary: vi.fn(() => []),
}));

import { dailyReportRepository } from '@/lib/repositories/daily-report.repository';
import { expenseRepository } from '@/lib/repositories/expense.repository';
import { productionRepository } from '@/lib/repositories/production.repository';
import { returnRepository } from '@/lib/repositories/return.repository';
import { saleRepository } from '@/lib/repositories/sale.repository';
import { wastageRepository } from '@/lib/repositories/wastage.repository';
import { dailySummaryService } from '@/lib/services/daily-summary.service';

const today = '2026-08-13';

const emptySummary = {
  id: today,
  organizationId: 'org-1',
  summaryDate: today,
  isClosed: false,
  closedAt: null,
  closedBy: null,
  totalProductionUnits: 12,
  totalProductionCost: 0,
  totalSalesRevenue: 500,
  totalSalesDiscount: 0,
  totalNetSales: 500,
  totalCogs: 100,
  transactionCount: 1,
  totalPurchases: 0,
  totalExpenses: 50,
  expensesByCategory: {},
  totalWastageCost: 10,
  wastageCount: 1,
  grossProfit: 400,
  netProfit: 340,
  computedAt: new Date(),
  version: 1,
};

describe('dailyReportRepository.getDailyReport date-bounded loading', () => {
  beforeEach(() => {
    vi.mocked(dailySummaryService.getOrRecalculate).mockReset();
    vi.mocked(saleRepository.listCompletedByDate).mockReset();
    vi.mocked(expenseRepository.listCompletedByDate).mockReset();
    vi.mocked(productionRepository.listCompletedByDate).mockReset();
    vi.mocked(wastageRepository.listCompletedByDate).mockReset();
    vi.mocked(returnRepository.listCompletedByDate).mockReset();
    vi.mocked(saleRepository.list).mockReset();
    vi.mocked(expenseRepository.list).mockReset();
    vi.mocked(productionRepository.list).mockReset();
    vi.mocked(wastageRepository.list).mockReset();
    vi.mocked(returnRepository.list).mockReset();

    vi.mocked(dailySummaryService.getOrRecalculate).mockResolvedValue(emptySummary as never);
    vi.mocked(saleRepository.listCompletedByDate).mockResolvedValue([
      {
        id: 'sale-1',
        saleNumber: 'SAL-001',
        saleDate: today,
        customerNameSnapshot: 'Walk-in',
        lineCount: 1,
        subtotal: 500,
        totalCogs: 100,
        status: 'completed',
        createdAt: new Date('2026-08-13T10:00:00.000Z'),
        updatedAt: new Date('2026-08-13T10:00:00.000Z'),
      },
    ]);
    vi.mocked(expenseRepository.listCompletedByDate).mockResolvedValue([]);
    vi.mocked(productionRepository.listCompletedByDate).mockResolvedValue([
      {
        id: 'prd-1',
        productionNumber: 'PRD-001',
        productionDate: today,
        lineCount: 1,
        totalUnits: 12,
        status: 'completed',
        createdAt: new Date('2026-08-13T09:00:00.000Z'),
        updatedAt: new Date('2026-08-13T09:00:00.000Z'),
      },
    ]);
    vi.mocked(wastageRepository.listCompletedByDate).mockResolvedValue([]);
    vi.mocked(returnRepository.listCompletedByDate).mockResolvedValue([]);
  });

  it('loads today via listCompletedByDate and never calls unbounded list()', async () => {
    const report = await dailyReportRepository.getDailyReport('org-1', today);

    expect(saleRepository.listCompletedByDate).toHaveBeenCalledWith('org-1', today);
    expect(expenseRepository.listCompletedByDate).toHaveBeenCalledWith('org-1', today);
    expect(productionRepository.listCompletedByDate).toHaveBeenCalledWith('org-1', today);
    expect(wastageRepository.listCompletedByDate).toHaveBeenCalledWith('org-1', today);
    expect(returnRepository.listCompletedByDate).toHaveBeenCalledWith('org-1', today);

    expect(saleRepository.list).not.toHaveBeenCalled();
    expect(expenseRepository.list).not.toHaveBeenCalled();
    expect(productionRepository.list).not.toHaveBeenCalled();
    expect(wastageRepository.list).not.toHaveBeenCalled();
    expect(returnRepository.list).not.toHaveBeenCalled();

    expect(report.sales.count).toBe(1);
    expect(report.production.totalUnits).toBe(12);
    expect(report.financial.grossSales).toBe(500);
    expect(report.financial.returnRevenue).toBe(0);
    expect(report.financial.netSales).toBe(500);
    expect(report.transactions).toHaveLength(2);
  });
});
