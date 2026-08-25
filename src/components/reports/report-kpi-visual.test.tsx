// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { Banknote, Trash2, TrendingUp, Wallet } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';

import { ReportExecutiveKpiCard } from '@/components/reports/report-executive-kpi-card';
import { ReportMetricCard } from '@/components/reports/report-metric-card';
import { buildSalesFlowPrefixSteps } from '@/components/reports/report-profit-flow-section';
import { MoneyDisplay } from '@/components/shared/money-display';
import { formatMoney } from '@/lib/utils/money';

const STRESS_AMOUNTS = [
  99_900,
  999_900,
  9_999_900,
  99_999_900,
  999_999_900,
  9_999_999_900,
  99_999_999_900,
] as const;

describe('report KPI visual hierarchy', () => {
  afterEach(() => {
    cleanup();
  });

  it('formats stress-test currency values in Indian locale', () => {
    expect(formatMoney(99_900)).toBe('₹999.00');
    expect(formatMoney(999_900)).toBe('₹9,999.00');
    expect(formatMoney(9_999_900)).toBe('₹99,999.00');
    expect(formatMoney(99_999_900)).toBe('₹9,99,999.00');
    expect(formatMoney(999_999_900)).toBe('₹99,99,999.00');
    expect(formatMoney(9_999_999_900)).toBe('₹9,99,99,999.00');
    expect(formatMoney(99_999_999_900)).toBe('₹99,99,99,999.00');
  });

  it('applies semantic value colors on executive KPI cards', () => {
    const { container, rerender } = render(
      <ReportExecutiveKpiCard
        title="Today's Net Sales"
        value={<MoneyDisplay amount={9_999_999_900} />}
        description="After returns today"
        icon={Banknote}
        tone="sales"
      />,
    );

    expect(container.querySelector('.text-primary')).toBeTruthy();
    expect(container.querySelector('.overflow-hidden')).toBeTruthy();
    expect(container.querySelector('.truncate')).toBeTruthy();

    rerender(
      <ReportExecutiveKpiCard
        title="Today's Profit"
        value={<MoneyDisplay amount={-500_000} />}
        description="After all costs"
        icon={TrendingUp}
        tone="profit"
        profitAmount={-500_000}
      />,
    );

    expect(container.querySelector('.text-destructive')).toBeTruthy();

    rerender(
      <ReportExecutiveKpiCard
        title="Expenses"
        value={<MoneyDisplay amount={1_250_000} />}
        description="Today's spending"
        icon={Wallet}
        tone="expense"
      />,
    );

    expect(container.querySelector('.text-warning-foreground')).toBeTruthy();
  });

  it('keeps large executive KPI values inside overflow-safe containers', () => {
    for (const amount of STRESS_AMOUNTS) {
      const { container, unmount } = render(
        <ReportExecutiveKpiCard
          title="Today's Net Sales"
          value={<MoneyDisplay amount={amount} />}
          description="After returns today"
          icon={Banknote}
          tone="sales"
        />,
      );

      const valueContainer = container.querySelector('.min-w-0.overflow-hidden');
      const valueText = screen.getByText(formatMoney(amount));

      expect(valueContainer).toBeTruthy();
      expect(valueText.closest('.truncate')).toBeTruthy();
      expect(valueText.className).not.toContain('text-muted-foreground');

      unmount();
      cleanup();
    }
  });

  it('applies semantic colors and overflow containment on financial detail cards', () => {
    const { container } = render(
      <ReportMetricCard
        title="Gross Profit"
        value={<MoneyDisplay amount={99_999_999_900} />}
        description="Net sales minus COGS"
        icon={TrendingUp}
        tone="profit"
        profitAmount={99_999_999_900}
      />,
    );

    expect(container.querySelector('.text-success')).toBeTruthy();
    expect(container.querySelector('.min-w-0.overflow-hidden')).toBeTruthy();

    cleanup();

    const wastage = render(
      <ReportMetricCard
        title="Wastage Cost"
        value={<MoneyDisplay amount={9_999_999_900} />}
        description="Inventory written off today"
        icon={Trash2}
        tone="wastage"
      />,
    );

    expect(wastage.container.querySelector('.text-warning-foreground')).toBeTruthy();
    expect(wastage.container.querySelector('.truncate')).toBeTruthy();
  });

  it('builds gross-returns-net profit flow steps from summary-derived amounts', () => {
    const steps = buildSalesFlowPrefixSteps(16_000, 8_000, 8_000);

    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatchObject({ label: 'Gross Sales', amount: 16_000 });
    expect(steps[1]).toMatchObject({ label: 'Returns', amount: 8_000, tone: 'expense' });
    expect(steps[2]).toMatchObject({ label: 'Net Sales', amount: 8_000 });
  });
});
