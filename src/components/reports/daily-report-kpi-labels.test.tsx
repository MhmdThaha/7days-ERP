// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DailyReportPage } from '@/components/reports/daily-report-page';

vi.mock('@/hooks/queries/use-daily-report', () => ({
  useDailyReport: vi.fn(),
}));

vi.mock('@/actions/daily-business-statement', () => ({
  getDailyBusinessStatementAction: vi.fn(),
}));

import { useDailyReport } from '@/hooks/queries/use-daily-report';

describe('daily report sales KPI labels', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows net sales and gross-returns-net flow labels', () => {
    vi.mocked(useDailyReport).mockReturnValue({
      data: {
        reportDate: '2026-08-23',
        sales: { totalAmount: 8_000, count: 1 },
        expenses: { totalAmount: 0, count: 0 },
        production: { totalUnits: 0, batchCount: 0 },
        wastage: { totalUnits: 0 },
        returns: { totalUnits: 2 },
        financial: {
          grossSales: 16_000,
          returnRevenue: 8_000,
          netSales: 8_000,
          totalCogs: 3_000,
          grossProfit: 5_000,
          expensesTotal: 0,
          wastageCost: 0,
          netProfit: 5_000,
        },
        transactions: [],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isRefetching: false,
    } as never);

    render(<DailyReportPage />);

    expect(screen.getByText("Today's Net Sales")).toBeTruthy();
    expect(screen.getByText('Gross Sales')).toBeTruthy();
    expect(screen.getByText('Subtracted from gross sales')).toBeTruthy();
    expect(screen.queryByText("Today's Sales")).toBeNull();
  });
});
