import type { ExpenseCategory } from '@/types/expense';

export type DailySummaryExpensesByCategory = Partial<Record<ExpenseCategory, number>>;

export type DailySummary = {
  id: string;
  organizationId: string;
  summaryDate: string;
  isClosed: boolean;
  closedAt: Date | null;
  closedBy: string | null;
  totalProductionUnits: number;
  totalProductionCost: number;
  totalSalesRevenue: number;
  totalSalesDiscount: number;
  totalNetSales: number;
  totalCogs: number;
  transactionCount: number;
  totalPurchases: number;
  totalExpenses: number;
  expensesByCategory: DailySummaryExpensesByCategory;
  totalWastageCost: number;
  wastageCount: number;
  grossProfit: number;
  netProfit: number;
  computedAt: Date;
  version: number;
};

export type DailySummaryAggregationInput = {
  organizationId: string;
  summaryDate: string;
  totalProductionUnits: number;
  totalProductionCost: number;
  totalSalesRevenue: number;
  totalSalesDiscount: number;
  totalNetSales: number;
  totalCogs: number;
  transactionCount: number;
  totalPurchases: number;
  totalExpenses: number;
  expensesByCategory: DailySummaryExpensesByCategory;
  totalWastageCost: number;
  wastageCount: number;
};
