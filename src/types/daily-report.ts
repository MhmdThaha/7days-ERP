export type DailyReportTransactionType = 'sale' | 'expense' | 'production' | 'wastage' | 'return';

export type DailyReportSalesSummary = {
  totalAmount: number;
  count: number;
};

export type DailyReportExpensesSummary = {
  totalAmount: number;
  count: number;
};

export type DailyReportProductionSummary = {
  totalUnits: number;
  batchCount: number;
};

export type DailyReportWastageSummary = {
  totalUnits: number;
};

export type DailyReportReturnsSummary = {
  totalUnits: number;
};

export type DailyReportFinancialSummary = {
  /** Completed sale subtotals before returns (from daily summary totalSalesRevenue). */
  grossSales: number;
  /** Return revenue applied today (grossSales − netSales). */
  returnRevenue: number;
  netSales: number;
  totalCogs: number;
  grossProfit: number;
  expensesTotal: number;
  wastageCost: number;
  netProfit: number;
};

export type DailyReportTransaction = {
  id: string;
  type: DailyReportTransactionType;
  number: string;
  date: string;
  detail: string;
  href: string;
  createdAt: Date;
};

export type DailyReportData = {
  reportDate: string;
  sales: DailyReportSalesSummary;
  expenses: DailyReportExpensesSummary;
  production: DailyReportProductionSummary;
  wastage: DailyReportWastageSummary;
  returns: DailyReportReturnsSummary;
  financial: DailyReportFinancialSummary;
  transactions: DailyReportTransaction[];
};
