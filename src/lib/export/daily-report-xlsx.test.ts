import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

import {
  buildDailyReportWorkbook,
  getDailyReportExportFilename,
  serializeDailyReportWorkbook,
  toArrayBuffer,
} from '@/lib/export/daily-report-xlsx';
import { formatMoney } from '@/lib/utils/money';
import type { DailyReportData } from '@/types/daily-report';

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

function makeReport(overrides: Partial<DailyReportData> = {}): DailyReportData {
  return {
    reportDate: '2026-08-14',
    sales: { totalAmount: 10_000, count: 2 },
    expenses: { totalAmount: 1_000, count: 1 },
    production: { totalUnits: 40, batchCount: 3 },
    wastage: { totalUnits: 5 },
    returns: { totalUnits: 2 },
    financial: {
      grossSales: 10_000,
      returnRevenue: 0,
      netSales: 10_000,
      totalCogs: 4_000,
      grossProfit: 6_000,
      expensesTotal: 1_000,
      wastageCost: 500,
      netProfit: 4_500,
    },
    transactions: [
      {
        id: 'sale-1',
        type: 'sale',
        number: 'SAL-001',
        date: '2026-08-14',
        detail: 'Walk-in',
        href: '/sales/sale-1',
        createdAt: new Date('2026-08-14T08:00:00.000Z'),
      },
    ],
    ...overrides,
  };
}

describe('buildDailyReportWorkbook', () => {
  it('copies summary values from DailyReportData without recalculating profit', () => {
    const report = makeReport({
      financial: {
        grossSales: 10_000,
        returnRevenue: 0,
        netSales: 10_000,
        totalCogs: 1_000,
        grossProfit: 999,
        expensesTotal: 100,
        wastageCost: 50,
        netProfit: 7,
      },
    });

    const summary = summaryMap(buildDailyReportWorkbook(report));

    expect(summary.get('Report date')).toBe('2026-08-14');
    expect(summary.get('Gross sales')).toBe(formatMoney(10_000));
    expect(summary.get('Returns')).toBe(formatMoney(0));
    expect(summary.get('Net sales')).toBe(formatMoney(10_000));
    expect(summary.get('COGS')).toBe(formatMoney(1_000));
    expect(summary.get('Gross profit')).toBe(formatMoney(999));
    expect(summary.get('Expenses')).toBe(formatMoney(100));
    expect(summary.get('Wastage cost')).toBe(formatMoney(50));
    expect(summary.get('Net profit')).toBe(formatMoney(7));
    expect(summary.get('Sales count')).toBe(2);
    expect(summary.get('Expense count')).toBe(1);
    expect(summary.get('Production units')).toBe(40);
    expect(summary.get('Production batch count')).toBe(3);
    expect(summary.get('Wastage units')).toBe(5);
    expect(summary.get('Returns units')).toBe(2);
    expect(summary.get('Activity count')).toBe(1);
  });

  it('uses reportDate in the filename helper', () => {
    expect(getDailyReportExportFilename('2026-01-03')).toBe('daily-report-2026-01-03.xlsx');
  });

  it('copies activity rows from the DTO including type labels', () => {
    const workbook = buildDailyReportWorkbook(makeReport());
    const activity = sheetMatrix(workbook, 'Activity');

    expect(activity[0]).toEqual(['Type', 'Number', 'Document date', 'Detail']);
    expect(activity[1]).toEqual(['Sale', 'SAL-001', '2026-08-14', 'Walk-in']);
  });

  it('exports an Activity sheet with headers only when there are no transactions', () => {
    const workbook = buildDailyReportWorkbook(makeReport({ transactions: [] }));
    const activity = sheetMatrix(workbook, 'Activity');
    const summary = summaryMap(workbook);

    expect(activity).toEqual([['Type', 'Number', 'Document date', 'Detail']]);
    expect(summary.get('Activity count')).toBe(0);
  });

  it('does not import Firebase repositories', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const mapper = readFileSync(resolve('src/lib/export/daily-report-xlsx.ts'), 'utf8');
    const downloader = readFileSync(resolve('src/lib/export/download-daily-report.ts'), 'utf8');

    expect(mapper).not.toMatch(/firebase|getOrgCollection|dailyReportRepository/);
    expect(downloader).not.toMatch(/firebase|getOrgCollection|dailyReportRepository|getDailyReportAction/);
  });

  it('serializes a real xlsx that still contains Summary and Activity after write', () => {
    const report = makeReport({
      financial: {
        grossSales: 10_000,
        returnRevenue: 0,
        netSales: 10_000,
        totalCogs: 1_000,
        grossProfit: 999,
        expensesTotal: 100,
        wastageCost: 50,
        netProfit: 7,
      },
    });
    const bytes = serializeDailyReportWorkbook(report);
    const header = new Uint8Array(bytes);

    expect(bytes.byteLength).toBeGreaterThan(100);
    expect(Array.from(header.slice(0, 2))).toEqual([0x50, 0x4b]);

    const roundTrip = XLSX.read(bytes, { type: 'array' });
    const summary = summaryMap(roundTrip);
    const activity = sheetMatrix(roundTrip, 'Activity');

    expect(roundTrip.SheetNames).toEqual(['Summary', 'Activity']);
    expect(summary.get('Report date')).toBe('2026-08-14');
    expect(summary.get('Net profit')).toBe(formatMoney(7));
    expect(activity[1]).toEqual(['Sale', 'SAL-001', '2026-08-14', 'Walk-in']);
  });

  it('does not zero-fill ArrayBuffer output from XLSX.write type array', () => {
    const written = XLSX.write(buildDailyReportWorkbook(makeReport()), {
      bookType: 'xlsx',
      type: 'array',
    });
    const bytes = new Uint8Array(toArrayBuffer(written));

    expect(written).toBeInstanceOf(ArrayBuffer);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });
});

describe('downloadDailyReport', () => {
  it('downloads from the provided report and does not call fetch', async () => {
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

    const createObjectURL = vi.fn(() => 'blob:daily-report');
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

    const { downloadDailyReport } = await import('@/lib/export/download-daily-report');
    downloadDailyReport(makeReport({ reportDate: '2026-08-14' }));

    expect(clicked).toEqual(['daily-report-2026-08-14.xlsx']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
