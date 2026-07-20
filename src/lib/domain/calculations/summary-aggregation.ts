import { calculateGrossProfit, calculateNetProfit } from '@/lib/domain/calculations/profit';
import type { DailySummary, DailySummaryAggregationInput } from '@/types/daily-summary';

export function buildDailySummaryMetrics(
  input: DailySummaryAggregationInput,
): Pick<DailySummary, 'grossProfit' | 'netProfit'> {
  const grossProfit = calculateGrossProfit(input.totalNetSales, input.totalCogs);
  const netProfit = calculateNetProfit(grossProfit, input.totalExpenses, input.totalWastageCost);

  return {
    grossProfit,
    netProfit,
  };
}

export function resolveCostTotal(
  documentTotal: number,
  movementTotal: number,
): number {
  if (documentTotal > 0) {
    return documentTotal;
  }

  return movementTotal;
}

export type AggregatedProfitSummary = {
  netSales: number;
  totalCogs: number;
  grossProfit: number;
  expensesTotal: number;
  wastageCost: number;
  netProfit: number;
  salesCount: number;
};

export function aggregateDailySummaries(
  summaries: Array<Pick<
    DailySummary,
    | 'totalNetSales'
    | 'totalCogs'
    | 'grossProfit'
    | 'totalExpenses'
    | 'totalWastageCost'
    | 'netProfit'
    | 'transactionCount'
  >>,
): AggregatedProfitSummary {
  return summaries.reduce<AggregatedProfitSummary>(
    (totals, summary) => ({
      netSales: totals.netSales + summary.totalNetSales,
      totalCogs: totals.totalCogs + summary.totalCogs,
      grossProfit: totals.grossProfit + summary.grossProfit,
      expensesTotal: totals.expensesTotal + summary.totalExpenses,
      wastageCost: totals.wastageCost + summary.totalWastageCost,
      netProfit: totals.netProfit + summary.netProfit,
      salesCount: totals.salesCount + summary.transactionCount,
    }),
    {
      netSales: 0,
      totalCogs: 0,
      grossProfit: 0,
      expensesTotal: 0,
      wastageCost: 0,
      netProfit: 0,
      salesCount: 0,
    },
  );
}
