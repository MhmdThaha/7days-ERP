import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

import {
  buildDailyBusinessStatementWorkbook,
  getDailyBusinessStatementExportFilename,
  serializeDailyBusinessStatementWorkbook,
} from '@/lib/export/daily-business-statement-xlsx';
import { formatMoney } from '@/lib/utils/money';
import {
  RETURNS_INVENTORY_NOTE,
  type DailyBusinessStatement,
} from '@/types/daily-business-statement';

function sheetMatrix(workbook: XLSX.WorkBook, name: string): unknown[][] {
  const sheet = workbook.Sheets[name];

  if (!sheet) {
    throw new Error(`Missing sheet: ${name}`);
  }

  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: '',
  });
}

function summaryMap(workbook: XLSX.WorkBook): Map<string, unknown> {
  const rows = sheetMatrix(workbook, 'Summary');
  const values = new Map<string, unknown>();

  for (const row of rows.slice(1)) {
    values.set(String(row[0]), row[1]);
  }

  return values;
}

function makeStatement(overrides: Partial<DailyBusinessStatement> = {}): DailyBusinessStatement {
  return {
    reportDate: '2026-08-10',
    summary: {
      netSales: 10_000,
      totalCogs: 4_000,
      grossProfit: 999,
      expensesTotal: 1_000,
      wastageCost: 500,
      netProfit: 7,
      salesCount: 1,
      expenseCount: 1,
      productionUnits: 40,
      productionBatchCount: 1,
      wastageUnits: 3,
      returnsUnits: 2,
      activityCount: 5,
      totalPurchases: 1_500,
      totalProductionCost: 2_000,
      expensesByCategory: [{ category: 'rent', label: 'Rent', amount: 1_000 }],
    },
    sales: [
      {
        saleNumber: 'SAL-001',
        saleDate: '2026-08-10',
        completedAt: '2026-08-10T08:05:00.000Z',
        customerNameSnapshot: 'Corner Shop',
        productCodeSnapshot: 'BRD',
        productNameSnapshot: 'Bread',
        quantity: 2,
        unit: 'pcs',
        sellingPriceSnapshot: 5000,
        lineTotal: 10_000,
        storedCogs: 4000,
        storedLineProfit: 6000,
      },
    ],
    expenses: [
      {
        expenseNumber: 'EXP-001',
        expenseDate: '2026-08-10',
        category: 'rent',
        categoryLabel: 'Rent',
        notes: 'Shop rent',
        amount: 1_000,
      },
    ],
    production: [
      {
        productionNumber: 'PRD-001',
        productionDate: '2026-08-10',
        productCode: 'BRD',
        productName: 'Bread',
        quantity: 40,
        unit: 'pcs',
        recipeName: 'White bread',
      },
    ],
    wastage: [
      {
        wastageNumber: 'WST-001',
        wastageDate: '2026-08-10',
        productCodeSnapshot: 'BRD',
        productNameSnapshot: 'Bread',
        quantity: 3,
        unit: 'pcs',
        reason: 'burnt',
        reasonLabel: 'Burnt',
        unitCost: 200,
        estimatedCost: 600,
      },
    ],
    returns: [
      {
        returnNumber: 'RET-001',
        returnDate: '2026-08-10',
        productCodeSnapshot: 'BRD',
        productNameSnapshot: 'Bread',
        quantity: 2,
        unit: 'pcs',
        reason: 'unsold',
        reasonLabel: 'Unsold',
        status: 'completed',
      },
    ],
    ...overrides,
  };
}

describe('buildDailyBusinessStatementWorkbook', () => {
  it('copies summary values from the statement DTO', () => {
    const summary = summaryMap(buildDailyBusinessStatementWorkbook(makeStatement()));

    expect(summary.get('Report date')).toBe('2026-08-10');
    expect(summary.get('Net sales')).toBe(formatMoney(10_000));
    expect(summary.get('COGS')).toBe(formatMoney(4_000));
    expect(summary.get('Gross profit')).toBe(formatMoney(999));
    expect(summary.get('Expenses')).toBe(formatMoney(1_000));
    expect(summary.get('Wastage cost')).toBe(formatMoney(500));
    expect(summary.get('Net profit')).toBe(formatMoney(7));
    expect(summary.get('Sales count')).toBe(1);
    expect(summary.get('Expense count')).toBe(1);
    expect(summary.get('Production units')).toBe(40);
    expect(summary.get('Production batch count')).toBe(1);
    expect(summary.get('Wastage units')).toBe(3);
    expect(summary.get('Returns units')).toBe(2);
    expect(summary.get('Activity count')).toBe(5);
    expect(summary.get('Total purchases')).toBe(formatMoney(1_500));
    expect(summary.get('Total production cost')).toBe(formatMoney(2_000));
    expect(summary.get('Expense — Rent')).toBe(formatMoney(1_000));
    expect(summary.get('Returns note')).toBe(RETURNS_INVENTORY_NOTE);
  });

  it('writes one sales row per stored line', () => {
    const sales = sheetMatrix(buildDailyBusinessStatementWorkbook(makeStatement()), 'Sales');

    expect(sales[0]?.[10]).toBe('Stored COGS');
    expect(sales[1]).toEqual([
      'SAL-001',
      '2026-08-10',
      '2026-08-10T08:05:00.000Z',
      'Corner Shop',
      'BRD',
      'Bread',
      2,
      'pcs',
      formatMoney(5000),
      formatMoney(10_000),
      formatMoney(4000),
      formatMoney(6000),
    ]);
  });

  it('writes expense, production, wastage, and return rows', () => {
    const workbook = buildDailyBusinessStatementWorkbook(makeStatement());

    expect(sheetMatrix(workbook, 'Expenses')[1]).toEqual([
      'EXP-001',
      '2026-08-10',
      'Rent',
      'Shop rent',
      formatMoney(1_000),
    ]);
    expect(sheetMatrix(workbook, 'Production')[1]).toEqual([
      'PRD-001',
      '2026-08-10',
      'BRD',
      'Bread',
      40,
      'pcs',
      'White bread',
    ]);
    expect(sheetMatrix(workbook, 'Wastage')[1]).toEqual([
      'WST-001',
      '2026-08-10',
      'BRD',
      'Bread',
      3,
      'pcs',
      'Burnt',
      formatMoney(200),
      formatMoney(600),
    ]);

    const returns = sheetMatrix(workbook, 'Returns');
    expect(returns[0]).toEqual([
      'Return number',
      'Return date',
      'Product code',
      'Product name',
      'Quantity',
      'Unit',
      'Reason',
      'Status',
    ]);
    expect(returns[1]).toEqual([
      'RET-001',
      '2026-08-10',
      'BRD',
      'Bread',
      2,
      'pcs',
      'Unsold',
      'completed',
    ]);
    expect(JSON.stringify(returns)).not.toMatch(/refund/i);
  });

  it('keeps headers on empty detail sheets', () => {
    const workbook = buildDailyBusinessStatementWorkbook(
      makeStatement({
        sales: [],
        expenses: [],
        production: [],
        wastage: [],
        returns: [],
        summary: {
          ...makeStatement().summary,
          salesCount: 0,
          expenseCount: 0,
          productionUnits: 0,
          productionBatchCount: 0,
          wastageUnits: 0,
          returnsUnits: 0,
          activityCount: 0,
          expensesByCategory: [],
        },
      }),
    );

    expect(sheetMatrix(workbook, 'Sales')).toHaveLength(1);
    expect(sheetMatrix(workbook, 'Expenses')).toHaveLength(1);
    expect(sheetMatrix(workbook, 'Production')).toHaveLength(1);
    expect(sheetMatrix(workbook, 'Wastage')).toHaveLength(1);
    expect(sheetMatrix(workbook, 'Returns')).toHaveLength(1);
    expect(summaryMap(workbook).get('Net profit')).toBe(formatMoney(7));
  });

  it('uses reportDate in the filename helper', () => {
    expect(getDailyBusinessStatementExportFilename('2026-01-03')).toBe(
      'daily-business-statement-2026-01-03.xlsx',
    );
  });

  it('does not import Firebase repositories', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const mapper = readFileSync(resolve('src/lib/export/daily-business-statement-xlsx.ts'), 'utf8');
    const downloader = readFileSync(
      resolve('src/lib/export/download-daily-business-statement.ts'),
      'utf8',
    );

    expect(mapper).not.toMatch(/firebase|getOrgCollection|dailySummaryService|getById/);
    expect(downloader).not.toMatch(
      /firebase|getOrgCollection|getDailyBusinessStatementAction|getDailyReportAction/,
    );
  });

  it('serializes a real xlsx that still contains all six sheets after write', () => {
    const bytes = serializeDailyBusinessStatementWorkbook(makeStatement());
    const header = new Uint8Array(bytes);

    expect(bytes.byteLength).toBeGreaterThan(100);
    expect(Array.from(header.slice(0, 2))).toEqual([0x50, 0x4b]);

    const roundTrip = XLSX.read(bytes, { type: 'array' });
    expect(roundTrip.SheetNames).toEqual([
      'Summary',
      'Sales',
      'Expenses',
      'Production',
      'Wastage',
      'Returns',
    ]);
    expect(summaryMap(roundTrip).get('Net profit')).toBe(formatMoney(7));
    expect(sheetMatrix(roundTrip, 'Sales')[1]?.[0]).toBe('SAL-001');
    expect(sheetMatrix(roundTrip, 'Expenses')[1]?.[0]).toBe('EXP-001');
    expect(sheetMatrix(roundTrip, 'Production')[1]?.[0]).toBe('PRD-001');
    expect(sheetMatrix(roundTrip, 'Wastage')[1]?.[0]).toBe('WST-001');
    expect(sheetMatrix(roundTrip, 'Returns')[1]?.[0]).toBe('RET-001');
  });
});

describe('downloadDailyBusinessStatement', () => {
  it('downloads from the provided statement and does not call fetch', async () => {
    const fetchSpy = vi.fn();
    const clicked: string[] = [];
    const anchor = {
      href: '',
      download: '',
      click() {
        clicked.push(this.download);
      },
      remove: vi.fn(),
    };

    vi.stubGlobal(
      'Blob',
      class FakeBlob {
        constructor(public readonly parts: unknown[]) {}
      },
    );
    vi.stubGlobal('document', {
      createElement: () => anchor,
      body: { appendChild: (node: unknown) => node },
    });
    vi.stubGlobal('fetch', fetchSpy);

    const createObjectURL = vi.fn(() => 'blob:daily-statement');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectURL,
    });

    const { downloadDailyBusinessStatement } = await import(
      '@/lib/export/download-daily-business-statement'
    );
    downloadDailyBusinessStatement(makeStatement({ reportDate: '2026-08-10' }));

    expect(clicked).toEqual(['daily-business-statement-2026-08-10.xlsx']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
