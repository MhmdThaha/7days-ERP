import * as XLSX from 'xlsx';

import { DAILY_REPORT_TRANSACTION_TYPE_LABELS } from '@/lib/domain/constants/daily-report';
import { formatMoney } from '@/lib/utils/money';
import type { DailyReportData } from '@/types/daily-report';

export function getDailyReportExportFilename(reportDate: string): string {
  return `daily-report-${reportDate}.xlsx`;
}

export function toArrayBuffer(output: unknown): ArrayBuffer {
  if (output instanceof ArrayBuffer) {
    return output;
  }

  if (ArrayBuffer.isView(output)) {
    const view = output as ArrayBufferView;
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
  }

  if (Array.isArray(output)) {
    return Uint8Array.from(output).buffer;
  }

  throw new Error('Unexpected spreadsheet output');
}

export function serializeDailyReportWorkbook(report: DailyReportData): ArrayBuffer {
  const workbook = buildDailyReportWorkbook(report);
  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return toArrayBuffer(output);
}

export function buildDailyReportWorkbook(report: DailyReportData): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ['Metric', 'Value'],
    ['Report date', report.reportDate],
    ['Gross sales', formatMoney(report.financial.grossSales)],
    ['Returns', formatMoney(report.financial.returnRevenue)],
    ['Net sales', formatMoney(report.financial.netSales)],
    ['COGS', formatMoney(report.financial.totalCogs)],
    ['Gross profit', formatMoney(report.financial.grossProfit)],
    ['Expenses', formatMoney(report.financial.expensesTotal)],
    ['Wastage cost', formatMoney(report.financial.wastageCost)],
    ['Net profit', formatMoney(report.financial.netProfit)],
    ['Sales count', report.sales.count],
    ['Expense count', report.expenses.count],
    ['Production units', report.production.totalUnits],
    ['Production batch count', report.production.batchCount],
    ['Wastage units', report.wastage.totalUnits],
    ['Returns units', report.returns.totalUnits],
    ['Activity count', report.transactions.length],
  ]);

  const activityRows: Array<Array<string | number>> = [
    ['Type', 'Number', 'Document date', 'Detail'],
    ...report.transactions.map((transaction) => [
      DAILY_REPORT_TRANSACTION_TYPE_LABELS[transaction.type],
      transaction.number,
      transaction.date,
      transaction.detail,
    ]),
  ];
  const activitySheet = XLSX.utils.aoa_to_sheet(activityRows);

  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
  XLSX.utils.book_append_sheet(workbook, activitySheet, 'Activity');

  return workbook;
}
