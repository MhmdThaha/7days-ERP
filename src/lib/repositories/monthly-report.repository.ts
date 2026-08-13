import 'server-only';

import {
  aggregateExpensesByCategory,
  aggregateOperationalTotals,
  aggregateProductCogsRanks,
  aggregateProductRankings,
  aggregateWastageByReason,
  buildDailyAnalytics,
  buildExecutiveKpis,
  buildMonthComparison,
  calculateInventoryValue,
  generateMonthlyInsights,
  sumRawMaterialStockValue,
} from '@/lib/domain/calculations/monthly-analytics';
import { aggregateDailySummaries } from '@/lib/domain/calculations/summary-aggregation';
import {
  MONTHLY_REPORT_FETCH_PAGE_SIZE,
  MONTHLY_REPORT_TRANSACTION_LIMIT,
} from '@/lib/domain/constants/monthly-report';
import { EXPENSE_CATEGORY_LABELS } from '@/lib/domain/constants/expense';
import { RETURN_REASON_LABELS } from '@/lib/domain/constants/return';
import { WASTAGE_REASON_LABELS } from '@/lib/domain/constants/wastage';
import { expenseRepository } from '@/lib/repositories/expense.repository';
import { productRepository } from '@/lib/repositories/product.repository';
import { productionRepository } from '@/lib/repositories/production.repository';
import { rawMaterialRepository } from '@/lib/repositories/raw-material.repository';
import { returnRepository } from '@/lib/repositories/return.repository';
import { saleRepository } from '@/lib/repositories/sale.repository';
import { wastageRepository } from '@/lib/repositories/wastage.repository';
import { dailySummaryService } from '@/lib/services/daily-summary.service';
import {
  formatMonthLabel,
  getDayOfMonth,
  getDaysInMonth,
  getPreviousMonthKey,
  isDateInMonth,
} from '@/lib/utils/month';
import type {
  DailyReportTransaction,
  DailyReportTransactionType,
} from '@/types/daily-report';
import type { MonthlyReportDailyTrend, MonthlyReportData } from '@/types/monthly-report';
import type { Sale } from '@/types/sale';
import type { Wastage } from '@/types/wastage';

function isCompletedInMonth(
  recordDate: string,
  status: string,
  monthKey: string,
): boolean {
  return isDateInMonth(recordDate, monthKey) && status === 'completed';
}

function sortTransactionsNewestFirst(
  transactions: DailyReportTransaction[],
): DailyReportTransaction[] {
  return transactions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

function formatUnits(value: number): string {
  return `${value.toLocaleString('en-IN')} units`;
}

function buildDailyTrend(
  monthKey: string,
  summariesByDate: Map<string, { totalNetSales: number }>,
): MonthlyReportDailyTrend[] {
  return getDaysInMonth(monthKey).map((date) => ({
    date,
    day: getDayOfMonth(date),
    netSales: summariesByDate.get(date)?.totalNetSales ?? 0,
  }));
}

export const monthlyReportRepository = {
  async getMonthlyReport(orgId: string, monthKey: string): Promise<MonthlyReportData> {
    const listParams = { page: 1, pageSize: MONTHLY_REPORT_FETCH_PAGE_SIZE };
    const previousMonthKey = getPreviousMonthKey(monthKey);

    const [
      dailySummaries,
      previousDailySummaries,
      salesResult,
      expensesResult,
      productionResult,
      wastageResult,
      returnsResult,
      productStockValue,
      rawMaterialsResult,
    ] = await Promise.all([
      dailySummaryService.getSummariesForMonth(orgId, monthKey),
      dailySummaryService.getSummariesForMonth(orgId, previousMonthKey),
      saleRepository.list(orgId, { ...listParams, status: 'completed' }),
      expenseRepository.list(orgId, { ...listParams, status: 'completed' }),
      productionRepository.list(orgId, { ...listParams, status: 'completed' }),
      wastageRepository.list(orgId, listParams),
      returnRepository.list(orgId, listParams),
      productRepository.sumStockValue(orgId),
      rawMaterialRepository.list(orgId, { ...listParams, status: 'all' }),
    ]);

    const monthSales = salesResult.items.filter((sale) => isDateInMonth(sale.saleDate, monthKey));
    const monthExpenses = expensesResult.items.filter((expense) =>
      isDateInMonth(expense.expenseDate, monthKey),
    );
    const monthProduction = productionResult.items.filter((entry) =>
      isDateInMonth(entry.productionDate, monthKey),
    );
    const monthWastage = wastageResult.items.filter((entry) =>
      isCompletedInMonth(entry.wastageDate, entry.status, monthKey),
    );
    const monthReturns = returnsResult.items.filter((entry) =>
      isCompletedInMonth(entry.returnDate, entry.status, monthKey),
    );

    const [fullMonthSales, fullMonthWastage] = await Promise.all([
      Promise.all(monthSales.map((sale) => saleRepository.getById(orgId, sale.id))),
      Promise.all(monthWastage.map((entry) => wastageRepository.getById(orgId, entry.id))),
    ]);

    const completedSales = fullMonthSales.filter((sale): sale is Sale => sale !== null);
    const completedWastage = fullMonthWastage.filter((entry): entry is Wastage => entry !== null);

    // Product-level COGS must use stored per-line `cogs`/`quantity` (no recalculation).
    // We fetch completed sales date-scoped to avoid loading the entire lifetime collection.
    const completedSalesForCogs: Sale[] = [];
    for (const date of getDaysInMonth(monthKey)) {
      const daySales = await saleRepository.listCompletedByDateWithLines(orgId, date);
      completedSalesForCogs.push(...daySales);
    }

    const productCogsRanks = aggregateProductCogsRanks(completedSalesForCogs);

    const profitSummary = aggregateDailySummaries(dailySummaries);
    const previousProfitSummary = aggregateDailySummaries(previousDailySummaries);
    const currentOperationalTotals = aggregateOperationalTotals(dailySummaries);
    const previousOperationalTotals = aggregateOperationalTotals(previousDailySummaries);
    const summariesByDate = new Map(
      dailySummaries.map((summary) => [summary.summaryDate, summary]),
    );

    const productionUnits = monthProduction.reduce((sum, entry) => sum + entry.totalUnits, 0);
    const wastageUnits = monthWastage.reduce((sum, entry) => sum + entry.totalUnits, 0);
    const returnsUnits = monthReturns.reduce((sum, entry) => sum + entry.totalUnits, 0);

    const summary = {
      netSales: profitSummary.netSales,
      totalCogs: profitSummary.totalCogs,
      grossProfit: profitSummary.grossProfit,
      expensesTotal: profitSummary.expensesTotal,
      wastageCost: profitSummary.wastageCost,
      netProfit: profitSummary.netProfit,
      salesCount: monthSales.length,
      expensesCount: monthExpenses.length,
      productionUnits,
      productionBatchCount: monthProduction.length,
      wastageUnits,
      returnsUnits,
    };

    const expenseBreakdown = aggregateExpensesByCategory(dailySummaries);
    const wastageBreakdown = aggregateWastageByReason(completedWastage);
    const { topSellingProducts, topRevenueProducts, topWastageProducts } = aggregateProductRankings(
      completedSales,
      completedWastage,
    );
    const topExpenseCategories = expenseBreakdown.slice(0, 5);
    const dailyAnalytics = buildDailyAnalytics(monthKey, summariesByDate);
    const rawMaterialStockValue = sumRawMaterialStockValue(rawMaterialsResult.items);
    const inventoryValue = calculateInventoryValue(productStockValue, rawMaterialStockValue);
    const executiveKpis = buildExecutiveKpis(
      summary,
      currentOperationalTotals.purchaseAmount,
      inventoryValue,
    );
    const comparison = buildMonthComparison(
      profitSummary,
      currentOperationalTotals.productionUnits,
      previousProfitSummary,
      previousOperationalTotals.productionUnits,
      formatMonthLabel(previousMonthKey),
    );
    const insights = generateMonthlyInsights({
      summary,
      comparison,
      topSellingProducts,
      topExpenseCategories,
      previousProfit: previousProfitSummary,
    });

    const transactions = sortTransactionsNewestFirst([
      ...monthSales.map((sale) => ({
        id: sale.id,
        type: 'sale' as DailyReportTransactionType,
        number: sale.saleNumber,
        date: sale.saleDate,
        detail: sale.customerNameSnapshot ?? 'Completed sale',
        href: `/sales/${sale.id}`,
        createdAt: sale.createdAt,
      })),
      ...monthExpenses.map((expense) => ({
        id: expense.id,
        type: 'expense' as DailyReportTransactionType,
        number: expense.expenseNumber,
        date: expense.expenseDate,
        detail: EXPENSE_CATEGORY_LABELS[expense.category],
        href: `/expenses/${expense.id}`,
        createdAt: expense.createdAt,
      })),
      ...monthProduction.map((entry) => ({
        id: entry.id,
        type: 'production' as DailyReportTransactionType,
        number: entry.productionNumber,
        date: entry.productionDate,
        detail: formatUnits(entry.totalUnits),
        href: `/production/${entry.id}`,
        createdAt: entry.createdAt,
      })),
      ...monthWastage.map((entry) => ({
        id: entry.id,
        type: 'wastage' as DailyReportTransactionType,
        number: entry.wastageNumber,
        date: entry.wastageDate,
        detail: WASTAGE_REASON_LABELS[entry.reason],
        href: `/wastage/${entry.id}`,
        createdAt: entry.createdAt,
      })),
      ...monthReturns.map((entry) => ({
        id: entry.id,
        type: 'return' as DailyReportTransactionType,
        number: entry.returnNumber,
        date: entry.returnDate,
        detail: RETURN_REASON_LABELS[entry.reason],
        href: `/returns/${entry.id}`,
        createdAt: entry.createdAt,
      })),
    ]).slice(0, MONTHLY_REPORT_TRANSACTION_LIMIT);

    return {
      monthKey,
      monthLabel: formatMonthLabel(monthKey),
      summary,
      dailyTrend: buildDailyTrend(monthKey, summariesByDate),
      dailyAnalytics,
      executiveKpis,
      comparison,
      insights,
      expenseBreakdown,
      wastageBreakdown,
      topSellingProducts,
      topRevenueProducts,
      topWastageProducts,
      topExpenseCategories,
      productCogsRanks,
      transactions,
    };
  },
};
