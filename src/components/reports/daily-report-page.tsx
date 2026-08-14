'use client';

import { useState } from 'react';
import {
  Banknote,
  Factory,
  FileDown,
  Package,
  RotateCcw,
  TrendingUp,
  Trash2,
  Wallet,
} from 'lucide-react';

import { toast } from 'sonner';

import { getDailyBusinessStatementAction } from '@/actions/daily-business-statement';
import { AccessDenied } from '@/components/shared/access-denied';
import {
  ReportActionCenter,
  ReportFinancialDetailsSection,
  ReportOperationalMetricsStrip,
  type ReportActionItem,
  type ReportOperationalMetric,
} from '@/components/reports/report-action-center';
import {
  ReportExecutiveKpiCard,
  ReportExecutiveKpiGrid,
} from '@/components/reports/report-executive-kpi-card';
import { ReportExecutiveVerdict } from '@/components/reports/report-executive-verdict';
import { ReportProfitFlowSection } from '@/components/reports/report-profit-flow-section';
import { ReportTransactionsSection } from '@/components/reports/report-transactions-section';
import { getProfitTone } from '@/components/reports/report-tone-utils';
import { ReportMetricCard } from '@/components/reports/report-metric-card';
import { reportPrimaryMetricGridClass } from '@/components/reports/report-kpi-value';
import { MoneyDisplay } from '@/components/shared/money-display';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useDailyReport } from '@/hooks/queries/use-daily-report';
import { downloadDailyBusinessStatement } from '@/lib/export/download-daily-business-statement';
import { formatDisplayDate } from '@/lib/utils/date';

import { DailyReportSkeleton } from './daily-report-skeleton';

function formatUnits(value: number): string {
  return `${value.toLocaleString('en-IN')} units`;
}

function formatExecutiveDate(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number);

  if (!year || !month || !day) {
    return formatDisplayDate(dateString);
  }

  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

function buildActionItems(
  netProfit: number,
  netSales: number,
  wastageCost: number,
): ReportActionItem[] {
  const items: ReportActionItem[] = [];

  if (netProfit < 0) {
    items.push({
      id: 'loss',
      title: 'Today lost money',
      description: 'Review expenses and wastage to understand what drove the loss.',
      tone: 'destructive',
    });
  }

  if (netSales > 0 && wastageCost / netSales > 0.1) {
    items.push({
      id: 'wastage',
      title: 'Wastage is high today',
      description: 'Wastage cost is a large share of today’s sales. Check what was written off.',
      tone: 'warning',
    });
  }

  return items;
}

export function DailyReportPage() {
  const { data, isLoading, error, refetch, isRefetching } = useDailyReport();
  const [isExporting, setIsExporting] = useState(false);

  if (isLoading) {
    return <DailyReportSkeleton />;
  }

  const isOrgError = error?.message.includes('Organization context is not configured');
  const isUnauthorized = error?.message.includes('permission to view reports');

  if (error || !data) {
    return (
      <div className="page-stack-loose">
        <ReportExecutiveVerdict
          title="Today's Report"
          subtitle="Daily business performance summary."
          message="Unable to load report data."
          tone="neutral"
        />
        {isUnauthorized ? (
          <AccessDenied description="Today's Report is available to owners and managers only." />
        ) : isOrgError ? (
          <Alert variant="destructive">
            <AlertTitle>Configuration required</AlertTitle>
            <AlertDescription>
              Set <code className="font-mono text-sm">DEV_ORG_ID</code> in your{' '}
              <code className="font-mono text-sm">.env.local</code> file to connect to Firestore.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            <LoadErrorAlert
              title="Failed to load daily report"
              error={error}
              onRetry={() => void refetch()}
              isRetrying={isRefetching}
            />
            {!error ? (
              <Alert variant="destructive">
                <AlertTitle>Daily report unavailable</AlertTitle>
                <AlertDescription>Unable to load daily report data.</AlertDescription>
              </Alert>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  const { financial } = data;
  const reportDate = data.reportDate;
  const profitTone = getProfitTone(financial.netProfit);
  const dateLabel = formatExecutiveDate(data.reportDate);
  const actionItems = buildActionItems(financial.netProfit, financial.netSales, financial.wastageCost);

  const verdictTone =
    profitTone === 'profit' ? 'success' : profitTone === 'loss' ? 'destructive' : 'neutral';

  const verdictMessage =
    profitTone === 'profit' ? (
      <>
        You made <MoneyDisplay amount={financial.netProfit} /> profit today.
      </>
    ) : profitTone === 'loss' ? (
      <>
        Today&apos;s loss is <MoneyDisplay amount={financial.netProfit} />.
      </>
    ) : (
      <>Today broke even — no profit and no loss.</>
    );

  const operationalMetrics: ReportOperationalMetric[] = [
    {
      label: 'Sales',
      value: data.sales.count.toLocaleString('en-IN'),
      description: 'Completed sales',
      icon: Banknote,
    },
    {
      label: 'Production',
      value: formatUnits(data.production.totalUnits),
      description: `${data.production.batchCount.toLocaleString('en-IN')} batches`,
      icon: Factory,
    },
    {
      label: 'Expenses',
      value: data.expenses.count.toLocaleString('en-IN'),
      description: 'Completed expenses',
      icon: Wallet,
    },
    {
      label: 'Wastage',
      value: formatUnits(data.wastage.totalUnits),
      description: 'Units written off',
      icon: Trash2,
    },
    {
      label: 'Returns',
      value: formatUnits(data.returns.totalUnits),
      description: 'Units returned',
      icon: RotateCcw,
    },
  ];

  async function handleExport() {
    if (isExporting) {
      return;
    }

    setIsExporting(true);

    try {
      const result = await getDailyBusinessStatementAction(reportDate);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      downloadDailyBusinessStatement(result.data);
    } catch {
      toast.error('Could not export the daily statement. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="page-stack-loose">
      <ReportExecutiveVerdict
        title="Today's Report"
        subtitle={dateLabel}
        message={verdictMessage}
        tone={verdictTone}
      />

      <div>
        <Button
          type="button"
          variant="secondary"
          size="xl"
          className="h-12 min-h-12 w-full gap-2 px-5 sm:w-auto"
          onClick={handleExport}
          disabled={isExporting}
          aria-label="Export daily business statement as Excel"
        >
          <FileDown data-icon="inline-start" aria-hidden="true" />
          {isExporting ? 'Preparing Excel…' : 'Export Daily Statement'}
        </Button>
      </div>

      <section aria-labelledby="daily-report-kpis-heading" className="section-stack">
        <h2 id="daily-report-kpis-heading" className="sr-only">
          Primary KPIs
        </h2>
        <ReportExecutiveKpiGrid>
          <ReportExecutiveKpiCard
            title="Today's Sales"
            value={<MoneyDisplay amount={financial.netSales} />}
            description="Money received today"
            icon={Banknote}
            tone="sales"
            actionHref="/sales"
            actionLabel="View sales"
          />
          <ReportExecutiveKpiCard
            title="Today's Profit"
            value={<MoneyDisplay amount={financial.netProfit} />}
            description="After all costs"
            icon={TrendingUp}
            tone={profitTone === 'loss' ? 'warning' : 'profit'}
            profitAmount={financial.netProfit}
          />
          <ReportExecutiveKpiCard
            title="Production"
            value={formatUnits(data.production.totalUnits)}
            description="Completed today"
            icon={Factory}
            tone="production"
            actionHref="/production"
            actionLabel="View production"
          />
          <ReportExecutiveKpiCard
            title="Expenses"
            value={<MoneyDisplay amount={financial.expensesTotal} />}
            description="Today's spending"
            icon={Wallet}
            tone="expense"
            actionHref="/expenses"
            actionLabel="View expenses"
          />
        </ReportExecutiveKpiGrid>
      </section>

      <ReportActionCenter items={actionItems} emptyDescription="Today's numbers look stable." />

      <ReportProfitFlowSection
        description="How today's sales became profit — step by step."
        steps={[
          { label: 'Sales', amount: financial.netSales, tone: 'sales' },
          {
            label: 'Cost of Goods Sold',
            amount: financial.totalCogs,
            description: 'Product cost at time of sale',
            tone: 'expense',
          },
          { label: 'Gross Profit', amount: financial.grossProfit, tone: 'profit' },
          {
            label: 'Expenses',
            amount: financial.expensesTotal,
            description: `${data.expenses.count.toLocaleString('en-IN')} completed expenses`,
            tone: 'expense',
          },
          {
            label: 'Wastage',
            amount: financial.wastageCost,
            description: 'Inventory written off today',
            tone: 'wastage',
          },
          { label: 'Net Profit', amount: financial.netProfit, tone: 'profit' },
        ]}
      />

      <ReportFinancialDetailsSection description="Additional financial breakdown and counts.">
        <div className={reportPrimaryMetricGridClass}>
          <ReportMetricCard
            title="Cost of Goods Sold"
            value={<MoneyDisplay amount={financial.totalCogs} />}
            description="Product cost at time of sale"
            icon={Package}
            tone="expense"
          />
          <ReportMetricCard
            title="Gross Profit"
            value={<MoneyDisplay amount={financial.grossProfit} />}
            description="Net sales minus COGS"
            icon={Banknote}
            tone="profit"
            profitAmount={financial.grossProfit}
          />
          <ReportMetricCard
            title="Wastage Cost"
            value={<MoneyDisplay amount={financial.wastageCost} />}
            description="Inventory written off today"
            icon={Trash2}
            tone="wastage"
          />
          <ReportMetricCard
            title="Transactions Today"
            value={data.transactions.length.toLocaleString('en-IN')}
            description="Completed records"
            icon={Banknote}
          />
        </div>
      </ReportFinancialDetailsSection>

      <ReportOperationalMetricsStrip metrics={operationalMetrics} />

      <ReportTransactionsSection transactions={data.transactions} />
    </div>
  );
}
