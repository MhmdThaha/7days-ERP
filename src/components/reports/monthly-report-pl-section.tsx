import {
  Banknote,
  CalendarRange,
  Factory,
  Package,
  RotateCcw,
  TrendingUp,
  Trash2,
  Wallet,
} from 'lucide-react';

import { ReportMetricCard } from '@/components/reports/report-metric-card';
import { MoneyDisplay } from '@/components/shared/money-display';
import type { MonthlyReportSummary } from '@/types/monthly-report';

type MonthlyReportPlSectionProps = {
  monthLabel: string;
  summary: MonthlyReportSummary;
};

function formatUnits(value: number): string {
  return `${value.toLocaleString('en-IN')} units`;
}

export function MonthlyReportPlSection({ monthLabel, summary }: MonthlyReportPlSectionProps) {
  return (
    <section
      aria-labelledby="monthly-report-pl-heading"
      className="space-y-4 rounded-xl border bg-muted/20 px-4 py-5 sm:px-6"
    >
      <div className="flex items-center gap-2">
        <CalendarRange className="size-5 text-primary" aria-hidden="true" />
        <div>
          <h2 id="monthly-report-pl-heading" className="text-lg font-semibold tracking-tight">
            Profit & Loss
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {monthLabel} — completed transactions only.
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <ReportMetricCard
          title="Net Sales"
          value={<MoneyDisplay amount={summary.netSales} />}
          description={`${summary.salesCount.toLocaleString('en-IN')} completed sale${summary.salesCount === 1 ? '' : 's'}`}
          icon={Banknote}
        />
        <ReportMetricCard
          title="Cost of Goods Sold"
          value={<MoneyDisplay amount={summary.totalCogs} />}
          description="Product cost at time of sale"
          icon={Package}
        />
        <ReportMetricCard
          title="Gross Profit"
          value={<MoneyDisplay amount={summary.grossProfit} />}
          description="Net sales minus COGS"
          icon={TrendingUp}
        />
        <ReportMetricCard
          title="Expenses"
          value={<MoneyDisplay amount={summary.expensesTotal} />}
          description={`${summary.expensesCount.toLocaleString('en-IN')} completed expense${summary.expensesCount === 1 ? '' : 's'}`}
          icon={Wallet}
        />
        <ReportMetricCard
          title="Wastage Cost"
          value={<MoneyDisplay amount={summary.wastageCost} />}
          description="Inventory written off this month"
          icon={Trash2}
        />
        <ReportMetricCard
          title="Net Profit"
          value={<MoneyDisplay amount={summary.netProfit} />}
          description="Gross profit minus expenses and wastage"
          icon={TrendingUp}
          variant="emphasis"
        />
        <ReportMetricCard
          title="Total Production"
          value={formatUnits(summary.productionUnits)}
          description={`${summary.productionBatchCount.toLocaleString('en-IN')} completed batch${summary.productionBatchCount === 1 ? '' : 'es'}`}
          icon={Factory}
        />
        <ReportMetricCard
          title="Total Wastage"
          value={formatUnits(summary.wastageUnits)}
          description="Completed wastage written off this month"
          icon={Trash2}
        />
        <ReportMetricCard
          title="Total Returns"
          value={formatUnits(summary.returnsUnits)}
          description="Completed returns received this month"
          icon={RotateCcw}
        />
      </div>
    </section>
  );
}
