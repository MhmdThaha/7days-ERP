import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';

import { MoneyDisplay } from '@/components/shared/money-display';
import { trendTextClass } from '@/components/reports/report-tone-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { MonthlyReportComparisonMetric } from '@/types/monthly-report';

type ReportComparisonMetricProps = {
  title: string;
  metric: MonthlyReportComparisonMetric;
  format?: 'money' | 'units';
  invertTrend?: boolean;
};

function formatUnits(value: number): string {
  return `${value.toLocaleString('en-IN')} units`;
}

function formatChangePercent(changePercent: number | null): string | null {
  if (changePercent === null) {
    return null;
  }

  if (changePercent === 0) {
    return '0.0%';
  }

  const sign = changePercent > 0 ? '+' : '';
  return `${sign}${changePercent.toFixed(1)}%`;
}

export function ReportComparisonMetric({
  title,
  metric,
  format = 'money',
  invertTrend = false,
}: ReportComparisonMetricProps) {
  const changeLabel = formatChangePercent(metric.changePercent);
  const isPositive = metric.changePercent !== null && metric.changePercent > 0;
  const isNegative = metric.changePercent !== null && metric.changePercent < 0;
  const TrendIcon = isPositive ? ArrowUpRight : isNegative ? ArrowDownRight : ArrowRight;

  return (
    <Card className="gap-0 rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-2xl font-bold tabular-nums">
          {format === 'money' ? (
            <MoneyDisplay amount={metric.current} />
          ) : (
            formatUnits(metric.current)
          )}
        </div>
        {changeLabel !== null ? (
          <div
            className={cn(
              'flex items-center gap-1 text-xs font-medium',
              trendTextClass(metric.changePercent, invertTrend),
            )}
          >
            <TrendIcon className="size-3.5" aria-hidden="true" />
            <span>{changeLabel} vs last month</span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No prior month baseline</p>
        )}
      </CardContent>
    </Card>
  );
}

export function MonthlyReportComparisonSection({
  monthLabel,
  previousMonthLabel,
  comparison,
}: {
  monthLabel: string;
  previousMonthLabel: string;
  comparison: {
    sales: MonthlyReportComparisonMetric;
    profit: MonthlyReportComparisonMetric;
    expenses: MonthlyReportComparisonMetric;
    production: MonthlyReportComparisonMetric;
    wastage: MonthlyReportComparisonMetric;
  };
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <ReportComparisonMetric title="Sales" metric={comparison.sales} format="money" />
      <ReportComparisonMetric title="Profit" metric={comparison.profit} format="money" />
      <ReportComparisonMetric
        title="Expenses"
        metric={comparison.expenses}
        format="money"
        invertTrend
      />
      <ReportComparisonMetric title="Production" metric={comparison.production} format="units" />
      <ReportComparisonMetric
        title="Wastage"
        metric={comparison.wastage}
        format="money"
        invertTrend
      />
    </div>
  );
}
