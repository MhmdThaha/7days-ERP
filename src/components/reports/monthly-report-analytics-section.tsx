import type { ReactNode } from 'react';
import { BarChart3, Factory, TrendingDown, TrendingUp } from 'lucide-react';

import { ReportBarList } from '@/components/reports/report-bar-list';
import { MoneyDisplay } from '@/components/shared/money-display';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  MonthlyReportBreakdownItem,
  MonthlyReportDailyAnalytics,
} from '@/types/monthly-report';

type MonthlyReportAnalyticsSectionProps = {
  monthLabel: string;
  dailyAnalytics: MonthlyReportDailyAnalytics[];
  expenseBreakdown: MonthlyReportBreakdownItem[];
  wastageBreakdown: MonthlyReportBreakdownItem[];
};

function buildTrendItems(
  dailyAnalytics: MonthlyReportDailyAnalytics[],
  valueKey: 'netSales' | 'netProfit' | 'productionUnits',
  formatValue: (value: number) => ReactNode,
) {
  const activeDays = dailyAnalytics.filter((entry) => entry[valueKey] !== 0);

  return activeDays.map((entry) => ({
    key: entry.date,
    label: `Day ${entry.day}`,
    value: Math.abs(entry[valueKey]),
    displayValue: formatValue(entry[valueKey]),
  }));
}

function formatUnits(value: number): string {
  return `${value.toLocaleString('en-IN')} units`;
}

function BreakdownCard({
  title,
  icon: Icon,
  items,
  emptyMessage,
}: {
  title: string;
  icon: typeof BarChart3;
  items: MonthlyReportBreakdownItem[];
  emptyMessage: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ReportBarList
          items={items.map((item) => ({
            key: item.key,
            label: item.label,
            value: item.amount,
            displayValue: <MoneyDisplay amount={item.amount} />,
          }))}
          emptyMessage={emptyMessage}
        />
      </CardContent>
    </Card>
  );
}

export function MonthlyReportAnalyticsSection({
  monthLabel,
  dailyAnalytics,
  expenseBreakdown,
  wastageBreakdown,
}: MonthlyReportAnalyticsSectionProps) {
  const salesTrend = buildTrendItems(dailyAnalytics, 'netSales', (value) => (
    <MoneyDisplay amount={value} />
  ));
  const profitTrend = buildTrendItems(dailyAnalytics, 'netProfit', (value) => (
    <MoneyDisplay amount={value} />
  ));
  const productionTrend = buildTrendItems(dailyAnalytics, 'productionUnits', formatUnits);

  return (
    <section aria-labelledby="monthly-report-analytics-heading" className="space-y-4">
      <div>
        <h2 id="monthly-report-analytics-heading" className="text-lg font-semibold tracking-tight">
          Analytics
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Daily trends and spending breakdowns for {monthLabel}.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <TrendingUp className="size-4 text-muted-foreground" aria-hidden="true" />
              Daily Sales Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ReportBarList
              items={salesTrend}
              emptyMessage="No sales recorded this month."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <TrendingDown className="size-4 text-muted-foreground" aria-hidden="true" />
              Daily Profit Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ReportBarList
              items={profitTrend}
              emptyMessage="No profit data recorded this month."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Factory className="size-4 text-muted-foreground" aria-hidden="true" />
              Production Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ReportBarList
              items={productionTrend}
              emptyMessage="No production recorded this month."
            />
          </CardContent>
        </Card>

        <BreakdownCard
          title="Expense Breakdown"
          icon={BarChart3}
          items={expenseBreakdown}
          emptyMessage="No expenses recorded this month."
        />

        <BreakdownCard
          title="Wastage Breakdown"
          icon={BarChart3}
          items={wastageBreakdown}
          emptyMessage="No wastage recorded this month."
        />
      </div>
    </section>
  );
}
