import 'server-only';

import {
  buildDailySummaryMetrics,
  resolveCostTotal,
} from '@/lib/domain/calculations/summary-aggregation';
import { dailySummaryRepository } from '@/lib/repositories/daily-summary.repository';
import { expenseRepository } from '@/lib/repositories/expense.repository';
import { inventoryMovementRepository } from '@/lib/repositories/inventory-movement.repository';
import { productionRepository } from '@/lib/repositories/production.repository';
import { purchaseRepository } from '@/lib/repositories/purchase.repository';
import { saleRepository } from '@/lib/repositories/sale.repository';
import { wastageRepository } from '@/lib/repositories/wastage.repository';
import { getDaysInMonth } from '@/lib/utils/month';
import type { DailySummary, DailySummaryExpensesByCategory } from '@/types/daily-summary';
import type { ExpenseCategory } from '@/types/expense';

export const dailySummaryService = {
  async getOrRecalculate(orgId: string, date: string): Promise<DailySummary> {
    const existing = await dailySummaryRepository.getByDate(orgId, date);

    if (existing) {
      return existing;
    }

    return this.recalculate(orgId, date);
  },

  async getSummariesForMonth(orgId: string, monthKey: string): Promise<DailySummary[]> {
    const dates = getDaysInMonth(monthKey);
    const existingSummaries = await dailySummaryRepository.listByMonth(orgId, monthKey);
    const summariesByDate = new Map(
      existingSummaries.map((summary) => [summary.summaryDate, summary]),
    );

    const missingDates = dates.filter((date) => !summariesByDate.has(date));

    if (missingDates.length > 0) {
      const recalculated = await Promise.all(
        missingDates.map((date) => this.recalculate(orgId, date)),
      );

      for (const summary of recalculated) {
        summariesByDate.set(summary.summaryDate, summary);
      }
    }

    return dates
      .map((date) => summariesByDate.get(date))
      .filter((summary): summary is DailySummary => summary !== undefined);
  },

  async recalculate(orgId: string, date: string): Promise<DailySummary> {
    const [
      daySales,
      dayExpenses,
      dayProduction,
      dayWastage,
      dayPurchases,
      saleOutCogsFromMovements,
      productionCostFromMovements,
      wastageCostFromMovements,
    ] = await Promise.all([
      saleRepository.listCompletedByDate(orgId, date),
      expenseRepository.listCompletedByDate(orgId, date),
      productionRepository.listCompletedByDate(orgId, date),
      wastageRepository.listCompletedByDate(orgId, date),
      purchaseRepository.listReceivedByDate(orgId, date),
      inventoryMovementRepository.sumTotalCostByMovementType(orgId, date, 'SALE_OUT'),
      inventoryMovementRepository.sumTotalCostByMovementType(orgId, date, 'PRODUCTION_FINISHED_IN'),
      inventoryMovementRepository.sumTotalCostByMovementType(orgId, date, 'WASTAGE_OUT'),
    ]);

    const totalSalesRevenue = daySales.reduce((sum, sale) => sum + sale.subtotal, 0);
    const totalSalesDiscount = 0;
    const totalNetSales = totalSalesRevenue - totalSalesDiscount;
    const totalCogsFromDocuments = daySales.reduce((sum, sale) => sum + sale.totalCogs, 0);
    const totalCogs = resolveCostTotal(totalCogsFromDocuments, saleOutCogsFromMovements);

    const expensesByCategory: DailySummaryExpensesByCategory = {};

    for (const expense of dayExpenses) {
      const category = expense.category as ExpenseCategory;
      expensesByCategory[category] = (expensesByCategory[category] ?? 0) + expense.amount;
    }

    const totalExpenses = dayExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const totalWastageCostFromDocuments = dayWastage.reduce(
      (sum, entry) => sum + entry.totalWastageCost,
      0,
    );
    const totalWastageCost = resolveCostTotal(
      totalWastageCostFromDocuments,
      wastageCostFromMovements,
    );

    const totalProductionUnits = dayProduction.reduce((sum, entry) => sum + entry.totalUnits, 0);
    const totalProductionCost = productionCostFromMovements;
    const totalPurchases = dayPurchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0);

    const profitMetrics = buildDailySummaryMetrics({
      organizationId: orgId,
      summaryDate: date,
      totalProductionUnits,
      totalProductionCost,
      totalSalesRevenue,
      totalSalesDiscount,
      totalNetSales,
      totalCogs,
      transactionCount: daySales.length,
      totalPurchases,
      totalExpenses,
      expensesByCategory,
      totalWastageCost,
      wastageCount: dayWastage.length,
    });

    return dailySummaryRepository.upsert(orgId, {
      organizationId: orgId,
      summaryDate: date,
      totalProductionUnits,
      totalProductionCost,
      totalSalesRevenue,
      totalSalesDiscount,
      totalNetSales,
      totalCogs,
      transactionCount: daySales.length,
      totalPurchases,
      totalExpenses,
      expensesByCategory,
      totalWastageCost,
      wastageCount: dayWastage.length,
      ...profitMetrics,
    });
  },
};
