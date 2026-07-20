export type DailySummaryDashboardKpis = {
  netSales: number;
  netProfit: number;
  grossProfit: number;
  totalCogs: number;
  expensesTotal: number;
  wastageCost: number;
  purchasesTotal: number;
  productionUnits: number;
};

export type DailySummaryDashboardOperationalMetrics = {
  salesCount: number;
  purchasesCount: number;
  productionBatchCount: number;
  expensesCount: number;
  wastageCount: number;
};

export type DailySummaryDashboardAlertType =
  | 'low_stock'
  | 'negative_stock'
  | 'high_wastage'
  | 'no_production'
  | 'no_sales';

export type DailySummaryDashboardAlertSeverity = 'info' | 'warning' | 'critical';

export type DailySummaryDashboardAlert = {
  id: string;
  type: DailySummaryDashboardAlertType;
  severity: DailySummaryDashboardAlertSeverity;
  title: string;
  description: string;
};

export type DailySummaryDashboardActivityModule =
  | 'purchase'
  | 'production'
  | 'sale'
  | 'expense'
  | 'wastage';

export type DailySummaryDashboardActivityItem = {
  id: string;
  module: DailySummaryDashboardActivityModule;
  time: Date;
  description: string;
  amount: number | null;
  href: string;
};

export type DailySummaryDashboardQuickSummaryTone =
  | 'positive'
  | 'neutral'
  | 'warning'
  | 'negative';

export type DailySummaryDashboardQuickSummaryItem = {
  id: string;
  tone: DailySummaryDashboardQuickSummaryTone;
  message: string;
};

export type DailySummaryDashboardData = {
  reportDate: string;
  kpis: DailySummaryDashboardKpis;
  operationalMetrics: DailySummaryDashboardOperationalMetrics;
  alerts: DailySummaryDashboardAlert[];
  activity: DailySummaryDashboardActivityItem[];
  quickSummary: DailySummaryDashboardQuickSummaryItem[];
};
