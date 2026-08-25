import 'server-only';

import { EXPENSE_CATEGORY_LABELS } from '@/lib/domain/constants/expense';
import { RETURN_REASON_LABELS } from '@/lib/domain/constants/return';
import { WASTAGE_REASON_LABELS } from '@/lib/domain/constants/wastage';
import { expenseRepository } from '@/lib/repositories/expense.repository';
import { productionRepository } from '@/lib/repositories/production.repository';
import { returnRepository } from '@/lib/repositories/return.repository';
import { saleRepository } from '@/lib/repositories/sale.repository';
import { wastageRepository } from '@/lib/repositories/wastage.repository';
import { dailySummaryService } from '@/lib/services/daily-summary.service';
import type {
  DailyReportData,
  DailyReportTransaction,
  DailyReportTransactionType,
} from '@/types/daily-report';

function sortTransactionsNewestFirst(
  transactions: DailyReportTransaction[],
): DailyReportTransaction[] {
  return transactions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

function formatUnits(value: number): string {
  return `${value.toLocaleString('en-IN')} units`;
}

export const dailyReportRepository = {
  async getDailyReport(orgId: string, today: string): Promise<DailyReportData> {
    // Financial KPIs come from the day summary doc. Activity rows use date-equality
    // list*ByDate queries so lifetime history does not determine read volume.
    const [dailySummary, todaySales, todayExpenses, todayProduction, todayWastage, todayReturns] =
      await Promise.all([
        dailySummaryService.getOrRecalculate(orgId, today),
        saleRepository.listCompletedByDate(orgId, today),
        expenseRepository.listCompletedByDate(orgId, today),
        productionRepository.listCompletedByDate(orgId, today),
        wastageRepository.listCompletedByDate(orgId, today),
        returnRepository.listCompletedByDate(orgId, today),
      ]);

    const productionUnits = todayProduction.reduce((sum, entry) => sum + entry.totalUnits, 0);
    const wastageUnits = todayWastage.reduce((sum, entry) => sum + entry.totalUnits, 0);
    const returnsUnits = todayReturns.reduce((sum, entry) => sum + entry.totalUnits, 0);

    const transactions = sortTransactionsNewestFirst([
      ...todaySales.map((sale) => ({
        id: sale.id,
        type: 'sale' as DailyReportTransactionType,
        number: sale.saleNumber,
        date: sale.saleDate,
        detail: sale.customerNameSnapshot ?? 'Completed sale',
        href: `/sales/${sale.id}`,
        createdAt: sale.createdAt,
      })),
      ...todayExpenses.map((expense) => ({
        id: expense.id,
        type: 'expense' as DailyReportTransactionType,
        number: expense.expenseNumber,
        date: expense.expenseDate,
        detail: EXPENSE_CATEGORY_LABELS[expense.category],
        href: `/expenses/${expense.id}`,
        createdAt: expense.createdAt,
      })),
      ...todayProduction.map((entry) => ({
        id: entry.id,
        type: 'production' as DailyReportTransactionType,
        number: entry.productionNumber,
        date: entry.productionDate,
        detail: formatUnits(entry.totalUnits),
        href: `/production/${entry.id}`,
        createdAt: entry.createdAt,
      })),
      ...todayWastage.map((entry) => ({
        id: entry.id,
        type: 'wastage' as DailyReportTransactionType,
        number: entry.wastageNumber,
        date: entry.wastageDate,
        detail: WASTAGE_REASON_LABELS[entry.reason],
        href: `/wastage/${entry.id}`,
        createdAt: entry.createdAt,
      })),
      ...todayReturns.map((entry) => ({
        id: entry.id,
        type: 'return' as DailyReportTransactionType,
        number: entry.returnNumber,
        date: entry.returnDate,
        detail: RETURN_REASON_LABELS[entry.reason],
        href: `/returns/${entry.id}`,
        createdAt: entry.createdAt,
      })),
    ]);

    return {
      reportDate: today,
      sales: {
        totalAmount: dailySummary.totalNetSales,
        count: todaySales.length,
      },
      expenses: {
        totalAmount: dailySummary.totalExpenses,
        count: todayExpenses.length,
      },
      production: {
        totalUnits: productionUnits,
        batchCount: todayProduction.length,
      },
      wastage: {
        totalUnits: wastageUnits,
      },
      returns: {
        totalUnits: returnsUnits,
      },
      financial: {
        grossSales: dailySummary.totalSalesRevenue,
        returnRevenue: dailySummary.totalSalesRevenue - dailySummary.totalNetSales,
        netSales: dailySummary.totalNetSales,
        totalCogs: dailySummary.totalCogs,
        grossProfit: dailySummary.grossProfit,
        expensesTotal: dailySummary.totalExpenses,
        wastageCost: dailySummary.totalWastageCost,
        netProfit: dailySummary.netProfit,
      },
      transactions,
    };
  },
};
