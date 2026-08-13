'use client';

import {
  Banknote,
  Factory,
  Package,
  ShoppingCart,
  TrendingUp,
  Trash2,
  Wallet,
} from 'lucide-react';

import {
  ReportActionCenter,
  ReportOperationalMetricsStrip,
  type ReportActionItem,
  type ReportOperationalMetric,
} from '@/components/reports/report-action-center';
import { ReportExecutiveKpiCard } from '@/components/reports/report-executive-kpi-card';
import { reportExecutiveKpiGridClass } from '@/components/reports/report-kpi-value';
import { ReportExecutiveVerdict } from '@/components/reports/report-executive-verdict';
import { MonthlyReportAnalyticsSection } from '@/components/reports/monthly-report-analytics-section';
import { MonthlyReportProductCogsSection } from '@/components/reports/monthly-report-product-cogs-section';
import { MonthlyReportFinancialDetailsSection } from '@/components/reports/monthly-report-financial-details-section';
import { MonthlyReportSkeleton } from '@/components/reports/monthly-report-skeleton';
import { ReportProfitFlowSection } from '@/components/reports/report-profit-flow-section';
import { ReportTransactionsSection } from '@/components/reports/report-transactions-section';
import { formatTrendPercent, getProfitTone } from '@/components/reports/report-tone-utils';
import { MoneyDisplay } from '@/components/shared/money-display';
import { AccessDenied } from '@/components/shared/access-denied';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useMonthlyReport } from '@/hooks/queries/use-monthly-report';
import type { MonthlyReportInsight } from '@/types/monthly-report';

function formatUnits(value: number): string {
  return `${value.toLocaleString('en-IN')} units`;
}

function mapActionableInsights(insights: MonthlyReportInsight[]): ReportActionItem[] {
  return insights
    .filter((insight) => insight.severity === 'warning' || insight.severity === 'negative')
    .map((insight) => ({
      id: insight.id,
      title: insight.title,
      description: insight.description,
      tone: insight.severity === 'negative' ? 'destructive' : 'warning',
    }));
}

export function MonthlyReportPage() {
  const { data, isLoading, isFetching, error, refetch, isRefetching } = useMonthlyReport();
  const showSkeleton = isLoading || (isFetching && !data);

  if (showSkeleton) {
    return <MonthlyReportSkeleton />;
  }

  const isOrgError = error?.message.includes('Organization context is not configured');
  const isUnauthorized = error?.message.includes('permission to view reports');

  if (error || !data) {
    return (
      <div className="page-stack-loose">
        <ReportExecutiveVerdict
          title="Month Summary"
          subtitle="Executive dashboard for bakery owners."
          message="Unable to load monthly summary."
          tone="neutral"
        />
        {isUnauthorized ? (
          <AccessDenied description="Month Summary is available to owners and managers only." />
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
              title="Failed to load monthly summary"
              error={error}
              onRetry={() => void refetch()}
              isRetrying={isRefetching}
            />
            {!error ? (
              <Alert variant="destructive">
                <AlertTitle>Monthly summary unavailable</AlertTitle>
                <AlertDescription>Unable to load monthly report data.</AlertDescription>
              </Alert>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  const { summary, executiveKpis, comparison } = data;
  const profitTone = getProfitTone(summary.netProfit);
  const profitChange = formatTrendPercent(comparison.profit.changePercent);
  const salesChange = formatTrendPercent(comparison.sales.changePercent);

  const verdictTone =
    profitTone === 'profit' ? 'success' : profitTone === 'loss' ? 'destructive' : 'neutral';

  const verdictMessage = (
    <>
      Net profit <MoneyDisplay amount={summary.netProfit} />
      {salesChange ? (
        <>
          {' '}
          · Sales {salesChange} vs {comparison.previousMonthLabel}
        </>
      ) : null}
      {!salesChange && profitChange ? (
        <>
          {' '}
          · {profitChange} vs {comparison.previousMonthLabel}
        </>
      ) : null}
    </>
  );

  const operationalMetrics: ReportOperationalMetric[] = [
    {
      label: 'Sales',
      value: summary.salesCount.toLocaleString('en-IN'),
      description: 'Completed sales',
      icon: Banknote,
    },
    {
      label: 'Production',
      value: formatUnits(summary.productionUnits),
      description: `${summary.productionBatchCount.toLocaleString('en-IN')} batches`,
      icon: Factory,
    },
    {
      label: 'Purchases',
      value: <MoneyDisplay amount={executiveKpis.purchaseAmount} />,
      description: 'Raw materials received',
      icon: ShoppingCart,
    },
    {
      label: 'Expenses',
      value: summary.expensesCount.toLocaleString('en-IN'),
      description: 'Completed expenses',
      icon: Wallet,
    },
    {
      label: 'Wastage',
      value: formatUnits(summary.wastageUnits),
      description: 'Units written off',
      icon: Trash2,
    },
  ];

  return (
    <div className="page-stack-loose">
      <ReportExecutiveVerdict
        title="Month Summary"
        subtitle={data.monthLabel}
        message={verdictMessage}
        tone={verdictTone}
      />

      <section aria-labelledby="monthly-report-kpis-heading" className="section-stack">
        <h2 id="monthly-report-kpis-heading" className="sr-only">
          Primary KPIs
        </h2>
        <div className={reportExecutiveKpiGridClass}>
          <ReportExecutiveKpiCard
            title="Total Sales"
            value={<MoneyDisplay amount={executiveKpis.totalSales} />}
            description="Money received this month"
            icon={Banknote}
            tone="sales"
            trendPercent={comparison.sales.changePercent}
            actionHref="/sales"
            actionLabel="View sales"
          />
          <ReportExecutiveKpiCard
            title="Net Profit"
            value={<MoneyDisplay amount={executiveKpis.netProfit} />}
            description="After expenses and wastage"
            icon={TrendingUp}
            tone={profitTone === 'loss' ? 'warning' : 'profit'}
            profitAmount={executiveKpis.netProfit}
            trendPercent={comparison.profit.changePercent}
          />
          <ReportExecutiveKpiCard
            title="Expenses"
            value={<MoneyDisplay amount={executiveKpis.expenseTotal} />}
            description="Operating costs this month"
            icon={Wallet}
            tone="expense"
            trendPercent={comparison.expenses.changePercent}
            invertTrend
            actionHref="/expenses"
            actionLabel="View expenses"
          />
          <ReportExecutiveKpiCard
            title="Production"
            value={formatUnits(executiveKpis.productionUnits)}
            description="Units produced this month"
            icon={Factory}
            tone="production"
            trendPercent={comparison.production.changePercent}
            actionHref="/production"
            actionLabel="View production"
          />
          <ReportExecutiveKpiCard
            title="Inventory Value"
            value={
              executiveKpis.inventoryValue !== null ? (
                <MoneyDisplay amount={executiveKpis.inventoryValue} />
              ) : (
                '—'
              )
            }
            description="Stock at cost"
            icon={Package}
            tone="neutral"
            actionHref="/inventory"
            actionLabel="View inventory"
          />
        </div>
      </section>

      <MonthlyReportAnalyticsSection
        dailyAnalytics={data.dailyAnalytics}
        expenseBreakdown={data.expenseBreakdown}
        topRevenueProducts={data.topRevenueProducts}
      />

      <MonthlyReportProductCogsSection productCogsRanks={data.productCogsRanks} />

      <ReportActionCenter
        items={mapActionableInsights(data.insights)}
        emptyTitle="All clear this month"
        emptyDescription="No warnings require your attention."
      />

      <ReportProfitFlowSection
        description="How this month's sales became profit — step by step."
        steps={[
          { label: 'Sales', amount: summary.netSales, tone: 'sales' },
          {
            label: 'Cost of Goods Sold',
            amount: summary.totalCogs,
            description: 'Product cost at time of sale',
            tone: 'expense',
          },
          { label: 'Gross Profit', amount: summary.grossProfit, tone: 'profit' },
          {
            label: 'Expenses',
            amount: summary.expensesTotal,
            description: `${summary.expensesCount.toLocaleString('en-IN')} completed expenses`,
            tone: 'expense',
          },
          {
            label: 'Wastage',
            amount: summary.wastageCost,
            description: 'Inventory written off this month',
            tone: 'wastage',
          },
          { label: 'Net Profit', amount: summary.netProfit, tone: 'profit' },
        ]}
      />

      <MonthlyReportFinancialDetailsSection
        monthLabel={data.monthLabel}
        summary={summary}
        executiveKpis={executiveKpis}
        comparison={comparison}
      />

      <ReportOperationalMetricsStrip metrics={operationalMetrics} />

      <ReportTransactionsSection
        transactions={data.transactions}
        title="Monthly Transactions"
        emptyMessage="No completed transactions recorded this month."
      />
    </div>
  );
}
