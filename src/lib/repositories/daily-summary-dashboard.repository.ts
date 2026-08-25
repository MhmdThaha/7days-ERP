import 'server-only';

import {
  buildDailySummaryAlerts,
  buildDailySummaryQuickSummary,
} from '@/lib/domain/calculations/daily-operations';
import {
  DAILY_SUMMARY_DASHBOARD_FETCH_PAGE_SIZE,
  DAILY_SUMMARY_DASHBOARD_LOW_STOCK_LIMIT,
} from '@/lib/domain/constants/daily-summary-dashboard';
import { EXPENSE_CATEGORY_LABELS } from '@/lib/domain/constants/expense';
import { WASTAGE_REASON_LABELS } from '@/lib/domain/constants/wastage';
import { expenseRepository } from '@/lib/repositories/expense.repository';
import { productRepository } from '@/lib/repositories/product.repository';
import { productionRepository } from '@/lib/repositories/production.repository';
import { purchaseRepository } from '@/lib/repositories/purchase.repository';
import { rawMaterialRepository } from '@/lib/repositories/raw-material.repository';
import { saleRepository } from '@/lib/repositories/sale.repository';
import { wastageRepository } from '@/lib/repositories/wastage.repository';
import { dailySummaryService } from '@/lib/services/daily-summary.service';
import type {
  DailySummaryDashboardActivityItem,
  DailySummaryDashboardData,
} from '@/types/daily-summary-dashboard';

function formatUnits(value: number): string {
  return `${value.toLocaleString('en-IN')} units`;
}

function sortActivityNewestFirst(
  activity: DailySummaryDashboardActivityItem[],
): DailySummaryDashboardActivityItem[] {
  return activity.sort((a, b) => b.time.getTime() - a.time.getTime());
}

export const dailySummaryDashboardRepository = {
  async getDashboard(orgId: string, today: string): Promise<DailySummaryDashboardData> {
    // Product alerts use an indexed low-stock query. Raw-material alerts still need a
    // catalog snapshot because reorder comparison is per-document. Today's activity uses
    // date-equality queries so lifetime history does not determine read volume.
    const rawMaterialListParams = { page: 1, pageSize: DAILY_SUMMARY_DASHBOARD_FETCH_PAGE_SIZE };

    const [
      dailySummary,
      todayPurchases,
      todaySales,
      todayExpenses,
      todayProduction,
      todayWastage,
      stockProducts,
      rawMaterialsResult,
    ] = await Promise.all([
      dailySummaryService.getOrRecalculate(orgId, today),
      purchaseRepository.listReceivedByDate(orgId, today),
      saleRepository.listCompletedByDate(orgId, today),
      expenseRepository.listCompletedByDate(orgId, today),
      productionRepository.listCompletedByDate(orgId, today),
      wastageRepository.listCompletedByDate(orgId, today),
      productRepository.listLowStockActive(orgId, DAILY_SUMMARY_DASHBOARD_LOW_STOCK_LIMIT),
      rawMaterialRepository.list(orgId, { ...rawMaterialListParams, status: 'all' }),
    ]);

    const kpis = {
      grossSales: dailySummary.totalSalesRevenue,
      returnRevenue: dailySummary.totalSalesRevenue - dailySummary.totalNetSales,
      netSales: dailySummary.totalNetSales,
      netProfit: dailySummary.netProfit,
      grossProfit: dailySummary.grossProfit,
      totalCogs: dailySummary.totalCogs,
      expensesTotal: dailySummary.totalExpenses,
      wastageCost: dailySummary.totalWastageCost,
      purchasesTotal: dailySummary.totalPurchases,
      productionUnits: dailySummary.totalProductionUnits,
    };

    const operationalMetrics = {
      salesCount: dailySummary.transactionCount,
      purchasesCount: todayPurchases.length,
      productionBatchCount: todayProduction.length,
      expensesCount: todayExpenses.length,
      wastageCount: dailySummary.wastageCount,
    };

    const stockRawMaterials = rawMaterialsResult.items.map((material) => ({
      id: material.id,
      name: material.name,
      code: material.code,
      currentStock: material.currentStock,
      unit: material.unit,
      reorderLevel: material.reorderLevel,
    }));

    const alerts = buildDailySummaryAlerts({
      kpis,
      operationalMetrics,
      products: stockProducts,
      rawMaterials: stockRawMaterials,
    });

    const quickSummary = buildDailySummaryQuickSummary({
      kpis,
      operationalMetrics,
      alerts,
    });

    const activity = sortActivityNewestFirst([
      ...todayPurchases.map((purchase) => ({
        id: purchase.id,
        module: 'purchase' as const,
        time: purchase.updatedAt,
        description: `${purchase.supplierName} — ${purchase.lineItemCount} line item${purchase.lineItemCount === 1 ? '' : 's'}`,
        amount: purchase.totalAmount,
        href: `/purchases/${purchase.id}`,
      })),
      ...todayProduction.map((entry) => ({
        id: entry.id,
        module: 'production' as const,
        time: entry.updatedAt,
        description: formatUnits(entry.totalUnits),
        amount: null,
        href: `/production/${entry.id}`,
      })),
      ...todaySales.map((sale) => ({
        id: sale.id,
        module: 'sale' as const,
        time: sale.updatedAt,
        description: sale.customerNameSnapshot ?? 'Completed sale',
        amount: sale.subtotal,
        href: `/sales/${sale.id}`,
      })),
      ...todayExpenses.map((expense) => ({
        id: expense.id,
        module: 'expense' as const,
        time: expense.updatedAt,
        description: EXPENSE_CATEGORY_LABELS[expense.category],
        amount: expense.amount,
        href: `/expenses/${expense.id}`,
      })),
      ...todayWastage.map((entry) => ({
        id: entry.id,
        module: 'wastage' as const,
        time: entry.updatedAt,
        description: `${WASTAGE_REASON_LABELS[entry.reason]} — ${formatUnits(entry.totalUnits)}`,
        amount: entry.totalWastageCost > 0 ? entry.totalWastageCost : null,
        href: `/wastage/${entry.id}`,
      })),
    ]);

    return {
      reportDate: today,
      kpis,
      operationalMetrics,
      alerts,
      activity,
      quickSummary,
    };
  },
};
