import type { DailyReportTransaction } from '@/types/daily-report';

export type MonthlyReportDailyTrend = {
  date: string;
  day: number;
  netSales: number;
};

export type MonthlyReportDailyAnalytics = {
  date: string;
  day: number;
  netSales: number;
  netProfit: number;
  productionUnits: number;
};

export type MonthlyReportProfitSummary = {
  netSales: number;
  totalCogs: number;
  grossProfit: number;
  expensesTotal: number;
  wastageCost: number;
  netProfit: number;
};

export type MonthlyReportSummary = MonthlyReportProfitSummary & {
  salesCount: number;
  expensesCount: number;
  productionUnits: number;
  productionBatchCount: number;
  wastageUnits: number;
  returnsUnits: number;
};

export type MonthlyReportBreakdownItem = {
  key: string;
  label: string;
  amount: number;
};

export type MonthlyReportProductRank = {
  productId: string;
  productName: string;
  productCode: string;
  quantity: number;
  revenue: number;
  wastageCost: number;
};

export type MonthlyReportProductCogsRank = {
  productId: string;
  productName: string;
  productCode: string;
  quantitySold: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  averageCogsPerUnit: number;
};

export type MonthlyReportComparisonMetric = {
  current: number;
  previous: number;
  changePercent: number | null;
};

export type MonthlyReportComparison = {
  previousMonthLabel: string;
  sales: MonthlyReportComparisonMetric;
  profit: MonthlyReportComparisonMetric;
  expenses: MonthlyReportComparisonMetric;
  production: MonthlyReportComparisonMetric;
  wastage: MonthlyReportComparisonMetric;
};

export type MonthlyReportExecutiveKpis = {
  totalSales: number;
  netProfit: number;
  grossMarginPercent: number | null;
  averageSaleValue: number | null;
  salesCount: number;
  productionUnits: number;
  purchaseAmount: number;
  wastagePercent: number | null;
  expenseTotal: number;
  inventoryValue: number | null;
};

export type MonthlyReportInsightSeverity = 'positive' | 'negative' | 'warning' | 'neutral';

export type MonthlyReportInsightType =
  | 'sales_change'
  | 'profit_change'
  | 'expenses_high'
  | 'wastage_increase'
  | 'margin_decrease'
  | 'best_seller'
  | 'top_expense_category';

export type MonthlyReportInsight = {
  id: string;
  type: MonthlyReportInsightType;
  severity: MonthlyReportInsightSeverity;
  title: string;
  description: string;
};

export type MonthlyReportData = {
  monthKey: string;
  monthLabel: string;
  summary: MonthlyReportSummary;
  dailyTrend: MonthlyReportDailyTrend[];
  dailyAnalytics: MonthlyReportDailyAnalytics[];
  executiveKpis: MonthlyReportExecutiveKpis;
  comparison: MonthlyReportComparison;
  insights: MonthlyReportInsight[];
  expenseBreakdown: MonthlyReportBreakdownItem[];
  wastageBreakdown: MonthlyReportBreakdownItem[];
  topSellingProducts: MonthlyReportProductRank[];
  topRevenueProducts: MonthlyReportProductRank[];
  topWastageProducts: MonthlyReportProductRank[];
  topExpenseCategories: MonthlyReportBreakdownItem[];
  productCogsRanks: MonthlyReportProductCogsRank[];
  transactions: DailyReportTransaction[];
};
