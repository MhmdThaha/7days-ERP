import { EXPENSE_CATEGORY_LABELS } from '@/lib/domain/constants/expense';
import { RETURN_REASON_LABELS } from '@/lib/domain/constants/return';
import { WASTAGE_REASON_LABELS } from '@/lib/domain/constants/wastage';
import type { DailySummary } from '@/types/daily-summary';
import type {
  DailyBusinessStatement,
  DailyBusinessStatementExpenseCategoryTotal,
} from '@/types/daily-business-statement';
import type { Expense, ExpenseCategory } from '@/types/expense';
import type { Production } from '@/types/production';
import type { ReturnEntry } from '@/types/return';
import type { Sale } from '@/types/sale';
import type { Wastage } from '@/types/wastage';

export type DailyBusinessStatementSource = {
  reportDate: string;
  summary: DailySummary;
  sales: Sale[];
  expenses: Expense[];
  production: Production[];
  wastage: Wastage[];
  returns: ReturnEntry[];
};

function toCompletedAtIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function expensesByCategoryFromSummary(
  summary: DailySummary,
): DailyBusinessStatementExpenseCategoryTotal[] {
  return (Object.entries(summary.expensesByCategory) as Array<[ExpenseCategory, number | undefined]>)
    .filter((entry): entry is [ExpenseCategory, number] => typeof entry[1] === 'number')
    .map(([category, amount]) => ({
      category,
      label: EXPENSE_CATEGORY_LABELS[category],
      amount,
    }));
}

export function buildDailyBusinessStatement(
  source: DailyBusinessStatementSource,
): DailyBusinessStatement {
  const salesLines = source.sales.flatMap((sale) =>
    sale.lines.map((line) => ({
      saleNumber: sale.saleNumber,
      saleDate: sale.saleDate,
      completedAt: toCompletedAtIso(sale.completedAt),
      customerNameSnapshot: sale.customerNameSnapshot,
      productCodeSnapshot: line.productCodeSnapshot,
      productNameSnapshot: line.productNameSnapshot,
      quantity: line.quantity,
      unit: line.unit,
      sellingPriceSnapshot: line.sellingPriceSnapshot,
      lineTotal: line.lineTotal,
      storedCogs: line.cogs,
      storedLineProfit: line.lineTotal - line.cogs,
    })),
  );

  const expenseRows = source.expenses.map((expense) => ({
    expenseNumber: expense.expenseNumber,
    expenseDate: expense.expenseDate,
    category: expense.category,
    categoryLabel: EXPENSE_CATEGORY_LABELS[expense.category],
    notes: expense.notes,
    amount: expense.amount,
  }));

  const productionLines = source.production.flatMap((entry) =>
    entry.lines.map((line) => ({
      productionNumber: entry.productionNumber,
      productionDate: entry.productionDate,
      productCode: line.productCode,
      productName: line.productName,
      quantity: line.quantity,
      unit: line.unit,
      recipeName: line.recipeName,
    })),
  );

  const wastageLines = source.wastage.flatMap((entry) =>
    entry.lines.map((line) => ({
      wastageNumber: entry.wastageNumber,
      wastageDate: entry.wastageDate,
      productCodeSnapshot: line.productCodeSnapshot,
      productNameSnapshot: line.productNameSnapshot,
      quantity: line.quantity,
      unit: line.unit,
      reason: entry.reason,
      reasonLabel: WASTAGE_REASON_LABELS[entry.reason],
      unitCost: line.unitCost,
      estimatedCost: line.estimatedCost,
    })),
  );

  const returnLines = source.returns.flatMap((entry) =>
    entry.lines.map((line) => ({
      returnNumber: entry.returnNumber,
      returnDate: entry.returnDate,
      productCodeSnapshot: line.productCodeSnapshot,
      productNameSnapshot: line.productNameSnapshot,
      quantity: line.quantity,
      unit: line.unit,
      reason: entry.reason,
      reasonLabel: RETURN_REASON_LABELS[entry.reason],
      status: entry.status,
    })),
  );

  const productionUnits = source.production.reduce((sum, entry) => sum + entry.totalUnits, 0);
  const wastageUnits = source.wastage.reduce((sum, entry) => sum + entry.totalUnits, 0);
  const returnsUnits = source.returns.reduce((sum, entry) => sum + entry.totalUnits, 0);

  return {
    reportDate: source.reportDate,
    summary: {
      netSales: source.summary.totalNetSales,
      totalCogs: source.summary.totalCogs,
      grossProfit: source.summary.grossProfit,
      expensesTotal: source.summary.totalExpenses,
      wastageCost: source.summary.totalWastageCost,
      netProfit: source.summary.netProfit,
      salesCount: source.sales.length,
      expenseCount: source.expenses.length,
      productionUnits,
      productionBatchCount: source.production.length,
      wastageUnits,
      returnsUnits,
      activityCount:
        source.sales.length +
        source.expenses.length +
        source.production.length +
        source.wastage.length +
        source.returns.length,
      totalPurchases: source.summary.totalPurchases,
      totalProductionCost: source.summary.totalProductionCost,
      expensesByCategory: expensesByCategoryFromSummary(source.summary),
    },
    sales: salesLines,
    expenses: expenseRows,
    production: productionLines,
    wastage: wastageLines,
    returns: returnLines,
  };
}
