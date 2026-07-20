import { GitCompare } from 'lucide-react';

import { ReportComparisonMetric } from '@/components/reports/report-comparison-metric';
import type { MonthlyReportComparison } from '@/types/monthly-report';

type MonthlyReportComparisonSectionProps = {
  monthLabel: string;
  comparison: MonthlyReportComparison;
};

export function MonthlyReportComparisonSection({
  monthLabel,
  comparison,
}: MonthlyReportComparisonSectionProps) {
  return (
    <section aria-labelledby="monthly-report-comparison-heading" className="space-y-4">
      <div className="flex items-center gap-2">
        <GitCompare className="size-5 text-muted-foreground" aria-hidden="true" />
        <div>
          <h2 id="monthly-report-comparison-heading" className="text-lg font-semibold tracking-tight">
            Month-over-Month
          </h2>
          <p className="text-sm text-muted-foreground">
            {monthLabel} compared to {comparison.previousMonthLabel}.
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <ReportComparisonMetric title="Sales" metric={comparison.sales} format="money" />
        <ReportComparisonMetric title="Profit" metric={comparison.profit} format="money" />
        <ReportComparisonMetric title="Expenses" metric={comparison.expenses} format="money" />
        <ReportComparisonMetric title="Production" metric={comparison.production} format="units" />
        <ReportComparisonMetric title="Wastage" metric={comparison.wastage} format="money" />
      </div>
    </section>
  );
}
