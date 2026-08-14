import * as XLSX from 'xlsx';

import { toArrayBuffer } from '@/lib/export/daily-report-xlsx';
import { formatMoney } from '@/lib/utils/money';
import {
  RETURNS_INVENTORY_NOTE,
  type DailyBusinessStatement,
} from '@/types/daily-business-statement';

export function getDailyBusinessStatementExportFilename(reportDate: string): string {
  return `daily-business-statement-${reportDate}.xlsx`;
}

export function serializeDailyBusinessStatementWorkbook(
  statement: DailyBusinessStatement,
): ArrayBuffer {
  const workbook = buildDailyBusinessStatementWorkbook(statement);
  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return toArrayBuffer(output);
}

export function buildDailyBusinessStatementWorkbook(
  statement: DailyBusinessStatement,
): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const { summary } = statement;

  const summaryRows: Array<Array<string | number>> = [
    ['Metric', 'Value'],
    ['Report date', statement.reportDate],
    ['Net sales', formatMoney(summary.netSales)],
    ['COGS', formatMoney(summary.totalCogs)],
    ['Gross profit', formatMoney(summary.grossProfit)],
    ['Expenses', formatMoney(summary.expensesTotal)],
    ['Wastage cost', formatMoney(summary.wastageCost)],
    ['Net profit', formatMoney(summary.netProfit)],
    ['Sales count', summary.salesCount],
    ['Expense count', summary.expenseCount],
    ['Production units', summary.productionUnits],
    ['Production batch count', summary.productionBatchCount],
    ['Wastage units', summary.wastageUnits],
    ['Returns units', summary.returnsUnits],
    ['Activity count', summary.activityCount],
    ['Total purchases', formatMoney(summary.totalPurchases)],
    ['Total production cost', formatMoney(summary.totalProductionCost)],
    ['Returns note', RETURNS_INVENTORY_NOTE],
  ];

  if (summary.expensesByCategory.length > 0) {
    summaryRows.push(['Expenses by category', '']);
    for (const category of summary.expensesByCategory) {
      summaryRows.push([`Expense — ${category.label}`, formatMoney(category.amount)]);
    }
  }

  const salesRows: Array<Array<string | number>> = [
    [
      'Sale number',
      'Sale date',
      'Completed at',
      'Customer/shop',
      'Product code',
      'Product name',
      'Quantity',
      'Unit',
      'Selling price',
      'Line total',
      'Stored COGS',
      'Stored line profit (line total − stored COGS)',
    ],
    ...statement.sales.map((line) => [
      line.saleNumber,
      line.saleDate,
      line.completedAt ?? '',
      line.customerNameSnapshot ?? '',
      line.productCodeSnapshot,
      line.productNameSnapshot,
      line.quantity,
      line.unit,
      formatMoney(line.sellingPriceSnapshot),
      formatMoney(line.lineTotal),
      formatMoney(line.storedCogs),
      formatMoney(line.storedLineProfit),
    ]),
  ];

  const expenseRows: Array<Array<string | number>> = [
    ['Expense number', 'Expense date', 'Category', 'Notes', 'Amount'],
    ...statement.expenses.map((expense) => [
      expense.expenseNumber,
      expense.expenseDate,
      expense.categoryLabel,
      expense.notes ?? '',
      formatMoney(expense.amount),
    ]),
  ];

  const productionRows: Array<Array<string | number>> = [
    [
      'Production number',
      'Production date',
      'Product code',
      'Product name',
      'Quantity',
      'Unit',
      'Recipe name',
    ],
    ...statement.production.map((line) => [
      line.productionNumber,
      line.productionDate,
      line.productCode,
      line.productName,
      line.quantity,
      line.unit,
      line.recipeName,
    ]),
  ];

  const wastageRows: Array<Array<string | number>> = [
    [
      'Wastage number',
      'Wastage date',
      'Product code',
      'Product name',
      'Quantity',
      'Unit',
      'Reason',
      'Unit cost',
      'Estimated cost',
    ],
    ...statement.wastage.map((line) => [
      line.wastageNumber,
      line.wastageDate,
      line.productCodeSnapshot,
      line.productNameSnapshot,
      line.quantity,
      line.unit,
      line.reasonLabel,
      formatMoney(line.unitCost),
      formatMoney(line.estimatedCost),
    ]),
  ];

  const returnRows: Array<Array<string | number>> = [
    [
      'Return number',
      'Return date',
      'Product code',
      'Product name',
      'Quantity',
      'Unit',
      'Reason',
      'Status',
    ],
    ...statement.returns.map((line) => [
      line.returnNumber,
      line.returnDate,
      line.productCodeSnapshot,
      line.productNameSnapshot,
      line.quantity,
      line.unit,
      line.reasonLabel,
      line.status,
    ]),
  ];

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryRows), 'Summary');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(salesRows), 'Sales');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(expenseRows), 'Expenses');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(productionRows), 'Production');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(wastageRows), 'Wastage');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(returnRows), 'Returns');

  return workbook;
}
