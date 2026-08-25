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

type ReturnRevenueSaleLine = {
  productId: string;
  quantity: number;
  sellingPriceSnapshot: number;
};

type ReturnRevenueReturnLine = {
  productId: string;
  quantity: number;
};

/**
 * Prices returned units against same-day completed sale lines (FIFO per product).
 * Used to reduce net sales without linking return documents to sale IDs.
 */
export function calculateReturnRevenueFromDaySales(
  daySales: Array<{ lines: ReturnRevenueSaleLine[] }>,
  dayReturns: Array<{ lines: ReturnRevenueReturnLine[] }>,
): number {
  const pool = new Map<string, Array<{ remaining: number; price: number }>>();

  for (const sale of daySales) {
    for (const line of sale.lines) {
      const buckets = pool.get(line.productId) ?? [];
      buckets.push({ remaining: line.quantity, price: line.sellingPriceSnapshot });
      pool.set(line.productId, buckets);
    }
  }

  let returnRevenue = 0;

  for (const returnEntry of dayReturns) {
    for (const line of returnEntry.lines) {
      let quantityLeft = line.quantity;
      const buckets = pool.get(line.productId) ?? [];

      for (const bucket of buckets) {
        if (quantityLeft <= 0) {
          break;
        }

        const matchedQuantity = Math.min(quantityLeft, bucket.remaining);

        if (matchedQuantity <= 0) {
          continue;
        }

        returnRevenue += Math.round(matchedQuantity * bucket.price);
        bucket.remaining -= matchedQuantity;
        quantityLeft -= matchedQuantity;
      }
    }
  }

  return returnRevenue;
}

export function calculateNetCogsAfterReturns(
  saleCogs: number,
  returnCogs: number,
): number {
  return Math.max(0, saleCogs - returnCogs);
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
