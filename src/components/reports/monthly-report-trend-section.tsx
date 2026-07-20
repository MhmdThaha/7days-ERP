import { TrendingUp } from 'lucide-react';

import { MoneyDisplay } from '@/components/shared/money-display';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MonthlyReportDailyTrend } from '@/types/monthly-report';

type MonthlyReportTrendSectionProps = {
  monthLabel: string;
  dailyTrend: MonthlyReportDailyTrend[];
};

export function MonthlyReportTrendSection({
  monthLabel,
  dailyTrend,
}: MonthlyReportTrendSectionProps) {
  return (
    <section aria-labelledby="monthly-report-trend-heading" className="space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="size-5 text-muted-foreground" aria-hidden="true" />
        <h2 id="monthly-report-trend-heading" className="text-lg font-semibold tracking-tight">
          Monthly Trend
        </h2>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">{monthLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-lg border">
            {dailyTrend.map((entry) => (
              <li
                key={entry.date}
                className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
              >
                <span className="w-8 shrink-0 font-medium tabular-nums text-muted-foreground">
                  {entry.day}
                </span>
                <span className="ml-auto font-semibold tabular-nums">
                  <MoneyDisplay amount={entry.netSales} />
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
