import { EXPENSE_CATEGORY_LABELS } from '@/lib/domain/constants/expense';
import { WASTAGE_REASON_LABELS } from '@/lib/domain/constants/wastage';
import { getDaysInMonth, getDayOfMonth } from '@/lib/utils/month';
import type { DailySummary, DailySummaryExpensesByCategory } from '@/types/daily-summary';
import type { Sale } from '@/types/sale';
import type {
  MonthlyReportBreakdownItem,
  MonthlyReportComparison,
  MonthlyReportComparisonMetric,
  MonthlyReportDailyAnalytics,
  MonthlyReportExecutiveKpis,
  MonthlyReportInsight,
  MonthlyReportProductRank,
  MonthlyReportProfitSummary,
  MonthlyReportSummary,
} from '@/types/monthly-report';
import type { Wastage } from '@/types/wastage';

const TOP_RANK_LIMIT = 5;

export function calculatePercentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return ((current - previous) / Math.abs(previous)) * 100;
}

export function buildComparisonMetric(current: number, previous: number): MonthlyReportComparisonMetric {
  return {
    current,
    previous,
    changePercent: calculatePercentChange(current, previous),
  };
}

type OperationalTotals = {
  productionUnits: number;
  purchaseAmount: number;
};

export function aggregateOperationalTotals(
  summaries: Array<Pick<DailySummary, 'totalProductionUnits' | 'totalPurchases'>>,
): OperationalTotals {
  return summaries.reduce(
    (totals, summary) => ({
      productionUnits: totals.productionUnits + summary.totalProductionUnits,
      purchaseAmount: totals.purchaseAmount + summary.totalPurchases,
    }),
    { productionUnits: 0, purchaseAmount: 0 },
  );
}

export function buildDailyAnalytics(
  monthKey: string,
  summariesByDate: Map<string, Pick<DailySummary, 'totalNetSales' | 'netProfit' | 'totalProductionUnits'>>,
): MonthlyReportDailyAnalytics[] {
  return getDaysInMonth(monthKey).map((date) => {
    const summary = summariesByDate.get(date);

    return {
      date,
      day: getDayOfMonth(date),
      netSales: summary?.totalNetSales ?? 0,
      netProfit: summary?.netProfit ?? 0,
      productionUnits: summary?.totalProductionUnits ?? 0,
    };
  });
}

export function aggregateExpensesByCategory(
  summaries: Array<Pick<DailySummary, 'expensesByCategory'>>,
): MonthlyReportBreakdownItem[] {
  const totals = new Map<string, number>();

  for (const summary of summaries) {
    for (const [category, amount] of Object.entries(summary.expensesByCategory) as Array<
      [keyof DailySummaryExpensesByCategory, number | undefined]
    >) {
      if (!category || amount === undefined || amount <= 0) {
        continue;
      }

      totals.set(category, (totals.get(category) ?? 0) + amount);
    }
  }

  return Array.from(totals.entries())
    .map(([key, amount]) => ({
      key,
      label: EXPENSE_CATEGORY_LABELS[key as keyof typeof EXPENSE_CATEGORY_LABELS] ?? key,
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export function aggregateWastageByReason(wastageEntries: Wastage[]): MonthlyReportBreakdownItem[] {
  const totals = new Map<string, number>();

  for (const entry of wastageEntries) {
    totals.set(entry.reason, (totals.get(entry.reason) ?? 0) + entry.totalWastageCost);
  }

  return Array.from(totals.entries())
    .map(([key, amount]) => ({
      key,
      label: WASTAGE_REASON_LABELS[key as keyof typeof WASTAGE_REASON_LABELS] ?? key,
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);
}

type ProductAccumulator = {
  productId: string;
  productName: string;
  productCode: string;
  quantity: number;
  revenue: number;
  wastageCost: number;
};

function upsertProductAccumulator(
  map: Map<string, ProductAccumulator>,
  productId: string,
  productName: string,
  productCode: string,
  quantityDelta: number,
  revenueDelta: number,
  wastageCostDelta: number,
): void {
  const existing = map.get(productId);

  if (existing) {
    existing.quantity += quantityDelta;
    existing.revenue += revenueDelta;
    existing.wastageCost += wastageCostDelta;
    return;
  }

  map.set(productId, {
    productId,
    productName,
    productCode,
    quantity: quantityDelta,
    revenue: revenueDelta,
    wastageCost: wastageCostDelta,
  });
}

function toProductRank(entry: ProductAccumulator): MonthlyReportProductRank {
  return {
    productId: entry.productId,
    productName: entry.productName,
    productCode: entry.productCode,
    quantity: entry.quantity,
    revenue: entry.revenue,
    wastageCost: entry.wastageCost,
  };
}

export function aggregateProductRankings(sales: Sale[], wastageEntries: Wastage[]): {
  topSellingProducts: MonthlyReportProductRank[];
  topRevenueProducts: MonthlyReportProductRank[];
  topWastageProducts: MonthlyReportProductRank[];
} {
  const salesByProduct = new Map<string, ProductAccumulator>();
  const wastageByProduct = new Map<string, ProductAccumulator>();

  for (const sale of sales) {
    for (const line of sale.lines) {
      upsertProductAccumulator(
        salesByProduct,
        line.productId,
        line.productNameSnapshot,
        line.productCodeSnapshot,
        line.quantity,
        line.lineTotal,
        0,
      );
    }
  }

  for (const entry of wastageEntries) {
    for (const line of entry.lines) {
      upsertProductAccumulator(
        wastageByProduct,
        line.productId,
        line.productNameSnapshot,
        line.productCodeSnapshot,
        line.quantity,
        0,
        line.estimatedCost,
      );
    }
  }

  const salesRanks = Array.from(salesByProduct.values()).map(toProductRank);

  return {
    topSellingProducts: [...salesRanks]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, TOP_RANK_LIMIT),
    topRevenueProducts: [...salesRanks]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, TOP_RANK_LIMIT),
    topWastageProducts: Array.from(wastageByProduct.values())
      .map(toProductRank)
      .sort((a, b) => b.wastageCost - a.wastageCost)
      .slice(0, TOP_RANK_LIMIT),
  };
}

export function calculateInventoryValue(
  productStockValue: number,
  rawMaterialStockValue: number,
): number {
  return productStockValue + rawMaterialStockValue;
}

export function sumRawMaterialStockValue(
  rawMaterials: Array<{ currentStock: number; averageCost: number }>,
): number {
  return rawMaterials.reduce(
    (total, material) => total + material.currentStock * material.averageCost,
    0,
  );
}

export function buildExecutiveKpis(
  summary: MonthlyReportSummary,
  purchaseAmount: number,
  inventoryValue: number | null,
): MonthlyReportExecutiveKpis {
  const grossMarginPercent =
    summary.netSales > 0 ? (summary.grossProfit / summary.netSales) * 100 : null;
  const averageSaleValue =
    summary.salesCount > 0 ? Math.round(summary.netSales / summary.salesCount) : null;
  const wastagePercent =
    summary.netSales > 0 ? (summary.wastageCost / summary.netSales) * 100 : null;

  return {
    totalSales: summary.netSales,
    netProfit: summary.netProfit,
    grossMarginPercent,
    averageSaleValue,
    salesCount: summary.salesCount,
    productionUnits: summary.productionUnits,
    purchaseAmount,
    wastagePercent,
    expenseTotal: summary.expensesTotal,
    inventoryValue,
  };
}

export function buildMonthComparison(
  currentProfit: MonthlyReportProfitSummary,
  currentProductionUnits: number,
  previousProfit: MonthlyReportProfitSummary,
  previousProductionUnits: number,
  previousMonthLabel: string,
): MonthlyReportComparison {
  return {
    previousMonthLabel,
    sales: buildComparisonMetric(currentProfit.netSales, previousProfit.netSales),
    profit: buildComparisonMetric(currentProfit.netProfit, previousProfit.netProfit),
    expenses: buildComparisonMetric(currentProfit.expensesTotal, previousProfit.expensesTotal),
    production: buildComparisonMetric(currentProductionUnits, previousProductionUnits),
    wastage: buildComparisonMetric(currentProfit.wastageCost, previousProfit.wastageCost),
  };
}

function formatPercent(value: number): string {
  return `${Math.abs(value).toFixed(1)}%`;
}

function currentGrossMarginPercent(summary: MonthlyReportProfitSummary): number | null {
  if (summary.netSales <= 0) {
    return null;
  }

  return (summary.grossProfit / summary.netSales) * 100;
}

function currentNetMarginPercent(summary: MonthlyReportProfitSummary): number | null {
  if (summary.netSales <= 0) {
    return null;
  }

  return (summary.netProfit / summary.netSales) * 100;
}

export function generateMonthlyInsights(input: {
  summary: MonthlyReportSummary;
  comparison: MonthlyReportComparison;
  topSellingProducts: MonthlyReportProductRank[];
  topExpenseCategories: MonthlyReportBreakdownItem[];
  previousProfit: MonthlyReportProfitSummary;
}): MonthlyReportInsight[] {
  const insights: MonthlyReportInsight[] = [];
  const { summary, comparison, topSellingProducts, topExpenseCategories, previousProfit } = input;

  const salesChange = comparison.sales.changePercent;
  if (salesChange !== null) {
    if (salesChange > 0) {
      insights.push({
        id: 'sales-increase',
        type: 'sales_change',
        severity: 'positive',
        title: 'Sales are up',
        description: `Sales increased by ${formatPercent(salesChange)} compared to ${comparison.previousMonthLabel}.`,
      });
    } else if (salesChange < 0) {
      insights.push({
        id: 'sales-decrease',
        type: 'sales_change',
        severity: 'warning',
        title: 'Sales declined',
        description: `Sales decreased by ${formatPercent(salesChange)} compared to ${comparison.previousMonthLabel}.`,
      });
    }
  }

  const profitChange = comparison.profit.changePercent;
  if (profitChange !== null) {
    if (profitChange > 0) {
      insights.push({
        id: 'profit-increase',
        type: 'profit_change',
        severity: 'positive',
        title: 'Profit improved',
        description: `Net profit increased by ${formatPercent(profitChange)} compared to ${comparison.previousMonthLabel}.`,
      });
    } else if (profitChange < 0) {
      insights.push({
        id: 'profit-decrease',
        type: 'profit_change',
        severity: 'negative',
        title: 'Profit declined',
        description: `Net profit decreased by ${formatPercent(profitChange)} compared to ${comparison.previousMonthLabel}.`,
      });
    }
  }

  const expenseRatio = summary.netSales > 0 ? summary.expensesTotal / summary.netSales : 0;
  const expensesIncreased =
    comparison.expenses.changePercent !== null && comparison.expenses.changePercent > 20;

  if (expenseRatio > 0.3 || expensesIncreased) {
    insights.push({
      id: 'expenses-high',
      type: 'expenses_high',
      severity: 'warning',
      title: 'Expenses need review',
      description:
        expenseRatio > 0.3
          ? `Expenses are ${formatPercent(expenseRatio * 100)} of net sales this month.`
          : `Expenses increased by ${formatPercent(comparison.expenses.changePercent ?? 0)} compared to ${comparison.previousMonthLabel}.`,
    });
  }

  if (comparison.wastage.changePercent !== null && comparison.wastage.changePercent > 20) {
    insights.push({
      id: 'wastage-increase',
      type: 'wastage_increase',
      severity: 'warning',
      title: 'Wastage increased',
      description: `Wastage cost rose by ${formatPercent(comparison.wastage.changePercent)} compared to ${comparison.previousMonthLabel}.`,
    });
  }

  const currentGrossMargin = currentGrossMarginPercent(summary);
  const previousGrossMargin = currentGrossMarginPercent(previousProfit);
  const currentNetMargin = currentNetMarginPercent(summary);
  const previousNetMargin = currentNetMarginPercent(previousProfit);

  if (
    currentGrossMargin !== null &&
    previousGrossMargin !== null &&
    currentGrossMargin < previousGrossMargin - 5
  ) {
    insights.push({
      id: 'margin-decrease',
      type: 'margin_decrease',
      severity: 'negative',
      title: 'Gross margin decreased',
      description: `Gross margin dropped from ${previousGrossMargin.toFixed(1)}% to ${currentGrossMargin.toFixed(1)}%.`,
    });
  } else if (
    currentNetMargin !== null &&
    previousNetMargin !== null &&
    currentNetMargin < previousNetMargin - 5
  ) {
    insights.push({
      id: 'net-margin-decrease',
      type: 'margin_decrease',
      severity: 'negative',
      title: 'Net margin decreased',
      description: `Net margin dropped from ${previousNetMargin.toFixed(1)}% to ${currentNetMargin.toFixed(1)}%.`,
    });
  }

  const bestSeller = topSellingProducts[0];
  if (bestSeller) {
    insights.push({
      id: 'best-seller',
      type: 'best_seller',
      severity: 'neutral',
      title: 'Best selling product',
      description: `${bestSeller.productName} led sales with ${bestSeller.quantity.toLocaleString('en-IN')} units sold.`,
    });
  }

  const topExpense = topExpenseCategories[0];
  if (topExpense) {
    insights.push({
      id: 'top-expense-category',
      type: 'top_expense_category',
      severity: 'neutral',
      title: 'Highest expense category',
      description: `${topExpense.label} was your largest expense category this month.`,
    });
  }

  return insights;
}
