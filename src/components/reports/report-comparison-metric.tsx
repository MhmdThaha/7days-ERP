import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';

import { MoneyDisplay } from '@/components/shared/money-display';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { MonthlyReportComparisonMetric } from '@/types/monthly-report';

type ReportComparisonMetricProps = {
  title: string;
  metric: MonthlyReportComparisonMetric;
  format?: 'money' | 'units';
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
}: ReportComparisonMetricProps) {
  const changeLabel = formatChangePercent(metric.changePercent);
  const isPositive = metric.changePercent !== null && metric.changePercent > 0;
  const isNegative = metric.changePercent !== null && metric.changePercent < 0;
  const TrendIcon = isPositive ? ArrowUpRight : isNegative ? ArrowDownRight : ArrowRight;

  return (
    <Card className="gap-0">
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
              isPositive && 'text-emerald-600 dark:text-emerald-400',
              isNegative && 'text-rose-600 dark:text-rose-400',
              !isPositive && !isNegative && 'text-muted-foreground',
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
