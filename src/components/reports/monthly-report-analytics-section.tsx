import type { ReactNode } from 'react';

import {
  hasDonutChartData,
  ReportDonutChart,
  type ReportDonutSegment,
} from '@/components/reports/report-donut-chart';
import {
  hasLineChartData,
  ReportLineChart,
  type ReportLineChartPoint,
} from '@/components/reports/report-line-chart';
import { ReportBarList, ReportChartCard } from '@/components/reports/report-bar-list';
import { MoneyDisplay } from '@/components/shared/money-display';
import type {
  MonthlyReportBreakdownItem,
  MonthlyReportDailyAnalytics,
  MonthlyReportProductRank,
} from '@/types/monthly-report';

type MonthlyReportAnalyticsSectionProps = {
  dailyAnalytics: MonthlyReportDailyAnalytics[];
  expenseBreakdown: MonthlyReportBreakdownItem[];
  topRevenueProducts: MonthlyReportProductRank[];
};

function buildDailyPoints(
  dailyAnalytics: MonthlyReportDailyAnalytics[],
  valueKey: 'netSales' | 'netProfit',
): ReportLineChartPoint[] {
  return dailyAnalytics.map((entry) => ({
    key: entry.date,
    label: String(entry.day),
    value: entry[valueKey],
  }));
}

export function MonthlyReportAnalyticsSection({
  dailyAnalytics,
  expenseBreakdown,
  topRevenueProducts,
}: MonthlyReportAnalyticsSectionProps) {
  const salesPoints = buildDailyPoints(dailyAnalytics, 'netSales');
  const profitPoints = buildDailyPoints(dailyAnalytics, 'netProfit');

  const revenueByProduct = topRevenueProducts.slice(0, 5).map((product) => ({
    key: product.productId,
    label: product.productName,
    value: product.revenue,
    displayValue: <MoneyDisplay amount={product.revenue} />,
  }));

  const expenseSegments: ReportDonutSegment[] = expenseBreakdown
    .filter((item) => item.amount > 0)
    .map((item) => ({
      key: item.key,
      label: item.label,
      value: item.amount,
    }));

  const charts = [
    hasLineChartData(salesPoints) ? (
      <ReportChartCard key="sales-trend" question="Are sales improving?">
        <ReportLineChart points={salesPoints} variant="sales" />
      </ReportChartCard>
    ) : null,
    hasLineChartData(profitPoints) ? (
      <ReportChartCard key="profit-trend" question="Are we making more profit?">
        <ReportLineChart points={profitPoints} variant="profit" />
      </ReportChartCard>
    ) : null,
    revenueByProduct.length > 0 ? (
      <ReportChartCard key="revenue-products" question="Which products earn the most?">
        <ReportBarList items={revenueByProduct} barTone="sales" />
      </ReportChartCard>
    ) : null,
    hasDonutChartData(expenseSegments) ? (
      <ReportChartCard key="expense-donut" question="Where is our money going?">
        <ReportDonutChart segments={expenseSegments} />
      </ReportChartCard>
    ) : null,
  ].filter(Boolean);

  if (charts.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="monthly-report-analytics-heading" className="section-stack">
      <div className="space-y-1">
        <h2 id="monthly-report-analytics-heading" className="text-lg font-semibold tracking-tight">
          Analytics
        </h2>
        <p className="text-sm text-muted-foreground">Four questions about how the month performed.</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">{charts}</div>
    </section>
  );
}
