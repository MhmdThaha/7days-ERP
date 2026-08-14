import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/services/daily-summary.service', () => ({
  dailySummaryService: {
    getOrRecalculate: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/purchase.repository', () => ({
  purchaseRepository: {
    list: vi.fn(),
    listReceivedByDate: vi.fn(),
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

vi.mock('@/lib/repositories/product.repository', () => ({
  productRepository: {
    list: vi.fn(),
    listLowStockActive: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/raw-material.repository', () => ({
  rawMaterialRepository: {
    list: vi.fn(),
  },
}));

import {
  DAILY_SUMMARY_DASHBOARD_FETCH_PAGE_SIZE,
  DAILY_SUMMARY_DASHBOARD_LOW_STOCK_LIMIT,
} from '@/lib/domain/constants/daily-summary-dashboard';
import { dailySummaryDashboardRepository } from '@/lib/repositories/daily-summary-dashboard.repository';
import { expenseRepository } from '@/lib/repositories/expense.repository';
import { productRepository } from '@/lib/repositories/product.repository';
import { productionRepository } from '@/lib/repositories/production.repository';
import { purchaseRepository } from '@/lib/repositories/purchase.repository';
import { rawMaterialRepository } from '@/lib/repositories/raw-material.repository';
import { saleRepository } from '@/lib/repositories/sale.repository';
import { wastageRepository } from '@/lib/repositories/wastage.repository';
import { dailySummaryService } from '@/lib/services/daily-summary.service';

const today = '2026-08-13';

describe('dailySummaryDashboardRepository.getDashboard date-bounded loading', () => {
  beforeEach(() => {
    vi.mocked(dailySummaryService.getOrRecalculate).mockReset();
    vi.mocked(purchaseRepository.listReceivedByDate).mockReset();
    vi.mocked(saleRepository.listCompletedByDate).mockReset();
    vi.mocked(expenseRepository.listCompletedByDate).mockReset();
    vi.mocked(productionRepository.listCompletedByDate).mockReset();
    vi.mocked(wastageRepository.listCompletedByDate).mockReset();
    vi.mocked(purchaseRepository.list).mockReset();
    vi.mocked(saleRepository.list).mockReset();
    vi.mocked(expenseRepository.list).mockReset();
    vi.mocked(productionRepository.list).mockReset();
    vi.mocked(wastageRepository.list).mockReset();
    vi.mocked(productRepository.list).mockReset();
    vi.mocked(productRepository.listLowStockActive).mockReset();
    vi.mocked(rawMaterialRepository.list).mockReset();

    vi.mocked(dailySummaryService.getOrRecalculate).mockResolvedValue({
      id: today,
      organizationId: 'org-1',
      summaryDate: today,
      isClosed: false,
      closedAt: null,
      closedBy: null,
      totalProductionUnits: 0,
      totalProductionCost: 0,
      totalSalesRevenue: 0,
      totalSalesDiscount: 0,
      totalNetSales: 0,
      totalCogs: 0,
      transactionCount: 0,
      totalPurchases: 200,
      totalExpenses: 0,
      expensesByCategory: {},
      totalWastageCost: 0,
      wastageCount: 0,
      grossProfit: 0,
      netProfit: 0,
      computedAt: new Date(),
      version: 1,
    } as never);

    vi.mocked(purchaseRepository.listReceivedByDate).mockResolvedValue([
      {
        id: 'pur-1',
        purchaseNumber: 'PUR-001',
        purchaseDate: today,
        supplierName: 'Mill',
        invoiceNumber: null,
        paymentStatus: 'paid',
        lineItemCount: 1,
        totalAmount: 200,
        status: 'received',
        createdAt: new Date('2026-08-13T08:00:00.000Z'),
        updatedAt: new Date('2026-08-13T08:00:00.000Z'),
      },
    ]);
    vi.mocked(saleRepository.listCompletedByDate).mockResolvedValue([]);
    vi.mocked(expenseRepository.listCompletedByDate).mockResolvedValue([]);
    vi.mocked(productionRepository.listCompletedByDate).mockResolvedValue([]);
    vi.mocked(wastageRepository.listCompletedByDate).mockResolvedValue([]);
    vi.mocked(productRepository.listLowStockActive).mockResolvedValue([]);
    vi.mocked(rawMaterialRepository.list).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10_000,
      totalPages: 1,
    });
  });

  it('loads today via list*ByDate and does not use unbounded module list() for activity', async () => {
    const dashboard = await dailySummaryDashboardRepository.getDashboard('org-1', today);

    expect(purchaseRepository.listReceivedByDate).toHaveBeenCalledWith('org-1', today);
    expect(saleRepository.listCompletedByDate).toHaveBeenCalledWith('org-1', today);
    expect(expenseRepository.listCompletedByDate).toHaveBeenCalledWith('org-1', today);
    expect(productionRepository.listCompletedByDate).toHaveBeenCalledWith('org-1', today);
    expect(wastageRepository.listCompletedByDate).toHaveBeenCalledWith('org-1', today);

    expect(purchaseRepository.list).not.toHaveBeenCalled();
    expect(saleRepository.list).not.toHaveBeenCalled();
    expect(expenseRepository.list).not.toHaveBeenCalled();
    expect(productionRepository.list).not.toHaveBeenCalled();
    expect(wastageRepository.list).not.toHaveBeenCalled();

    expect(dashboard.operationalMetrics.purchasesCount).toBe(1);
    expect(dashboard.kpis.purchasesTotal).toBe(200);
    expect(dashboard.activity).toHaveLength(1);
    expect(dashboard.activity[0]?.module).toBe('purchase');
  });

  it('loads product stock alerts via indexed low-stock query, not productRepository.list()', async () => {
    vi.mocked(productRepository.listLowStockActive).mockResolvedValue([
      {
        id: 'prd-1',
        code: 'PRD-001',
        name: 'Bread',
        currentStock: 0,
        unit: 'pcs',
      },
      {
        id: 'prd-2',
        code: 'PRD-002',
        name: 'Croissant',
        currentStock: -3,
        unit: 'pcs',
      },
    ]);
    vi.mocked(rawMaterialRepository.list).mockResolvedValue({
      items: [
        {
          id: 'rm-1',
          code: 'RM-001',
          name: 'Flour',
          category: 'dry',
          unit: 'kg',
          currentStock: 2,
          averageCost: 40,
          reorderLevel: 5,
          description: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      total: 1,
      page: 1,
      pageSize: DAILY_SUMMARY_DASHBOARD_FETCH_PAGE_SIZE,
      totalPages: 1,
    });

    const dashboard = await dailySummaryDashboardRepository.getDashboard('org-1', today);

    expect(productRepository.listLowStockActive).toHaveBeenCalledWith(
      'org-1',
      DAILY_SUMMARY_DASHBOARD_LOW_STOCK_LIMIT,
    );
    expect(productRepository.list).not.toHaveBeenCalled();
    expect(rawMaterialRepository.list).toHaveBeenCalledWith('org-1', {
      page: 1,
      pageSize: DAILY_SUMMARY_DASHBOARD_FETCH_PAGE_SIZE,
      status: 'all',
    });

    const lowStock = dashboard.alerts.find((alert) => alert.type === 'low_stock');
    const negativeStock = dashboard.alerts.find((alert) => alert.type === 'negative_stock');

    expect(lowStock?.description).toBe(
      '2 products and 1 raw material need restocking attention.',
    );
    expect(negativeStock?.description).toBe(
      'Croissant has negative stock. Review inventory immediately.',
    );
  });
});
