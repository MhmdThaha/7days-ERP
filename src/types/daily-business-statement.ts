import type { ExpenseCategory } from '@/types/expense';
import type { ReturnReason, ReturnStatus } from '@/types/return';
import type { WastageReason } from '@/types/wastage';

export const RETURNS_INVENTORY_NOTE =
  'Inventory return; monetary refund is not represented in the current return model.';

export type DailyBusinessStatementExpenseCategoryTotal = {
  category: ExpenseCategory;
  label: string;
  amount: number;
};

export type DailyBusinessStatementSummary = {
  netSales: number;
  totalCogs: number;
  grossProfit: number;
  expensesTotal: number;
  wastageCost: number;
  netProfit: number;
  salesCount: number;
  expenseCount: number;
  productionUnits: number;
  productionBatchCount: number;
  wastageUnits: number;
  returnsUnits: number;
  activityCount: number;
  totalPurchases: number;
  totalProductionCost: number;
  expensesByCategory: DailyBusinessStatementExpenseCategoryTotal[];
};

export type DailyBusinessStatementSaleLine = {
  saleNumber: string;
  saleDate: string;
  completedAt: string | null;
  customerNameSnapshot: string | null;
  productCodeSnapshot: string;
  productNameSnapshot: string;
  quantity: number;
  unit: string;
  sellingPriceSnapshot: number;
  lineTotal: number;
  storedCogs: number;
  storedLineProfit: number;
};

export type DailyBusinessStatementExpense = {
  expenseNumber: string;
  expenseDate: string;
  category: ExpenseCategory;
  categoryLabel: string;
  notes: string | null;
  amount: number;
};

export type DailyBusinessStatementProductionLine = {
  productionNumber: string;
  productionDate: string;
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  recipeName: string;
};

export type DailyBusinessStatementWastageLine = {
  wastageNumber: string;
  wastageDate: string;
  productCodeSnapshot: string;
  productNameSnapshot: string;
  quantity: number;
  unit: string;
  reason: WastageReason;
  reasonLabel: string;
  unitCost: number;
  estimatedCost: number;
};

export type DailyBusinessStatementReturnLine = {
  returnNumber: string;
  returnDate: string;
  productCodeSnapshot: string;
  productNameSnapshot: string;
  quantity: number;
  unit: string;
  reason: ReturnReason;
  reasonLabel: string;
  status: ReturnStatus;
};

export type DailyBusinessStatement = {
  reportDate: string;
  summary: DailyBusinessStatementSummary;
  sales: DailyBusinessStatementSaleLine[];
  expenses: DailyBusinessStatementExpense[];
  production: DailyBusinessStatementProductionLine[];
  wastage: DailyBusinessStatementWastageLine[];
  returns: DailyBusinessStatementReturnLine[];
};
