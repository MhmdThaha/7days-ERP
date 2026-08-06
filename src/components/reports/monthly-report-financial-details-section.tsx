import type { ReactNode } from 'react';

import { MonthlyReportComparisonSection } from '@/components/reports/report-comparison-metric';
import { ReportFinancialDetailsSection } from '@/components/reports/report-action-center';
import {
  ReportKpiValue,
  reportPrimaryMetricGridClass,
} from '@/components/reports/report-kpi-value';
import { profitValueClass } from '@/components/reports/report-tone-utils';
import { MoneyDisplay } from '@/components/shared/money-display';
import { cn } from '@/lib/utils';
import type {
  MonthlyReportComparison,
  MonthlyReportExecutiveKpis,
  MonthlyReportSummary,
} from '@/types/monthly-report';

type MonthlyReportFinancialDetailsSectionProps = {
  monthLabel: string;
  summary: MonthlyReportSummary;
  executiveKpis: MonthlyReportExecutiveKpis;
  comparison: MonthlyReportComparison;
};

function formatPercent(value: number | null): string {
  if (value === null) {
    return '—';
  }

  return `${value.toFixed(1)}%`;
}

function PrimaryMetric({
  label,
  value,
  description,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  description: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border bg-card px-5 py-5 sm:px-6 sm:py-6">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div className="mt-2">
        <ReportKpiValue variant="primary" className={valueClassName}>
          {value}
        </ReportKpiValue>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function SecondaryMetric({
  label,
  value,
  description,
}: {
  label: string;
  value: ReactNode;
  description: string;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-dashed bg-muted/15 px-4 py-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1.5">
        <ReportKpiValue variant="secondary">{value}</ReportKpiValue>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

export function MonthlyReportFinancialDetailsSection({
  monthLabel,
  summary,
  executiveKpis,
  comparison,
}: MonthlyReportFinancialDetailsSectionProps) {
  return (
    <ReportFinancialDetailsSection
      description={`${monthLabel} compared to ${comparison.previousMonthLabel}, plus secondary metrics.`}
    >
      <div className="space-y-8">
        <div className={reportPrimaryMetricGridClass}>
          <PrimaryMetric
            label="Net Profit"
            value={<MoneyDisplay amount={summary.netProfit} />}
            description="After expenses and wastage"
            valueClassName={profitValueClass(summary.netProfit)}
          />
          <PrimaryMetric
            label="Gross Profit"
            value={<MoneyDisplay amount={summary.grossProfit} />}
            description="Net sales minus COGS"
            valueClassName="text-success"
          />
          <PrimaryMetric
            label="Gross Margin"
            value={formatPercent(executiveKpis.grossMarginPercent)}
            description="Gross profit as % of sales"
          />
          <PrimaryMetric
            label="Average Sale"
            value={
              executiveKpis.averageSaleValue !== null ? (
                <MoneyDisplay amount={executiveKpis.averageSaleValue} />
              ) : (
                '—'
              )
            }
            description="Net sales per completed sale"
          />
          <PrimaryMetric
            label="Wastage"
            value={formatPercent(executiveKpis.wastagePercent)}
            description="Wastage cost as % of sales"
            valueClassName={
              executiveKpis.wastagePercent !== null && executiveKpis.wastagePercent > 10
                ? 'text-destructive'
                : undefined
            }
          />
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Secondary metrics
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SecondaryMetric
              label="Inventory Value"
              value={
                executiveKpis.inventoryValue !== null ? (
                  <MoneyDisplay amount={executiveKpis.inventoryValue} />
                ) : (
                  '—'
                )
              }
              description="Products and raw materials at cost"
            />
            <SecondaryMetric
              label="Sales Count"
              value={summary.salesCount.toLocaleString('en-IN')}
              description="Completed sales this month"
            />
            <SecondaryMetric
              label="Production Units"
              value={summary.productionUnits.toLocaleString('en-IN')}
              description={`${summary.productionBatchCount.toLocaleString('en-IN')} batches`}
            />
            <SecondaryMetric
              label="Expense Total"
              value={<MoneyDisplay amount={summary.expensesTotal} />}
              description={`${summary.expensesCount.toLocaleString('en-IN')} expenses`}
            />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Month-over-month
          </h3>
          <MonthlyReportComparisonSection
            monthLabel={monthLabel}
            previousMonthLabel={comparison.previousMonthLabel}
            comparison={comparison}
          />
        </div>
      </div>
    </ReportFinancialDetailsSection>
  );
}
