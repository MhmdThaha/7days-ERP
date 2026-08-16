'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Banknote,
  Factory,
  Package,
  ShoppingCart,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react';

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
import { getProfitTone } from '@/components/reports/report-tone-utils';
import { ReportMetricCard } from '@/components/reports/report-metric-card';
import { reportPrimaryMetricGridClass } from '@/components/reports/report-kpi-value';
import { DailySummaryActivitySection } from '@/components/daily-summary/daily-summary-activity-section';
import { DailySummarySkeleton } from '@/components/daily-summary/daily-summary-skeleton';
import { MoneyDisplay } from '@/components/shared/money-display';
import { AccessDenied } from '@/components/shared/access-denied';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useDailySummaryDashboard } from '@/hooks/queries/use-daily-summary-dashboard';
import { isUnauthorizedError } from '@/lib/domain/errors';
import type {
  DailySummaryDashboardAlert,
  DailySummaryDashboardQuickSummaryItem,
} from '@/types/daily-summary-dashboard';

function formatExecutiveDate(dateString: string): string {
  const [year, month, monthDay] = dateString.split('-').map(Number);

  if (!year || !month || !monthDay) {
    return dateString;
  }

  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, monthDay));
}

function formatUnits(value: number): string {
  return `${value.toLocaleString('en-IN')} units`;
}

function getVerdictFromQuickSummary(items: DailySummaryDashboardQuickSummaryItem[]) {
  if (items.some((item) => item.tone === 'negative')) {
    return { tone: 'destructive' as const, message: items.find((item) => item.tone === 'negative')?.message ?? 'Today needs attention.' };
  }

  if (items.some((item) => item.tone === 'warning')) {
    return { tone: 'warning' as const, message: items.find((item) => item.tone === 'warning')?.message ?? 'Some areas need attention today.' };
  }

  if (items.some((item) => item.tone === 'positive')) {
    return { tone: 'success' as const, message: items.find((item) => item.tone === 'positive')?.message ?? 'Today is going well.' };
  }

  return { tone: 'neutral' as const, message: items[0]?.message ?? 'Review today’s operational numbers below.' };
}

function mapAlertsToActions(alerts: DailySummaryDashboardAlert[]): ReportActionItem[] {
  return alerts.map((alert) => ({
    id: alert.id,
    title: alert.title,
    description: alert.description,
    tone:
      alert.severity === 'critical'
        ? 'destructive'
        : alert.severity === 'warning'
          ? 'warning'
          : 'neutral',
  }));
}

export function DailySummaryPage() {
  const { data, isLoading, isFetching, error, refetch, isRefetching } = useDailySummaryDashboard();
  const showSkeleton = isLoading || (isFetching && !data);

  if (showSkeleton) {
    return <DailySummarySkeleton />;
  }

  const isOrgError = error?.message.includes('Organization context is not configured');
  const isUnauthorized = isUnauthorizedError(error);

  if (error || !data) {
    return (
      <div className="page-stack-loose">
        <ReportExecutiveVerdict
          title="Daily Summary"
          subtitle="Kitchen operations for today."
          message="Unable to load daily summary."
          tone="neutral"
        />
        {isUnauthorized ? (
          <AccessDenied description="Kitchen Dashboard is available to owners and managers only." />
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
              title="Failed to load daily summary"
              error={error}
              onRetry={() => void refetch()}
              isRetrying={isRefetching}
            />
            {!error ? (
              <Alert variant="destructive">
                <AlertTitle>Daily summary unavailable</AlertTitle>
                <AlertDescription>Unable to load daily summary data.</AlertDescription>
              </Alert>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  const { kpis, operationalMetrics } = data;
  const profitTone = getProfitTone(kpis.netProfit);
  const verdict = getVerdictFromQuickSummary(data.quickSummary);
  const dateLabel = formatExecutiveDate(data.reportDate);

  const operationalStrip: ReportOperationalMetric[] = [
    {
      label: 'Sales',
      value: operationalMetrics.salesCount.toLocaleString('en-IN'),
      description: 'Completed today',
      icon: Banknote,
    },
    {
      label: 'Purchases',
      value: operationalMetrics.purchasesCount.toLocaleString('en-IN'),
      description: 'Received today',
      icon: ShoppingCart,
    },
    {
      label: 'Production',
      value: operationalMetrics.productionBatchCount.toLocaleString('en-IN'),
      description: 'Batches completed',
      icon: Factory,
    },
    {
      label: 'Expenses',
      value: operationalMetrics.expensesCount.toLocaleString('en-IN'),
      description: 'Recorded today',
      icon: Wallet,
    },
    {
      label: 'Wastage',
      value: operationalMetrics.wastageCount.toLocaleString('en-IN'),
      description: 'Entries today',
      icon: Trash2,
    },
  ];

  return (
    <div className="page-stack-loose">
      <ReportExecutiveVerdict
        title="Daily Summary"
        subtitle={`Kitchen operations for ${dateLabel}`}
        message={verdict.message}
        tone={verdict.tone}
      />

      <section aria-labelledby="daily-summary-kpis-heading" className="section-stack">
        <h2 id="daily-summary-kpis-heading" className="sr-only">
          Primary KPIs
        </h2>
        <ReportExecutiveKpiGrid>
          <ReportExecutiveKpiCard
            title="Today's Sales"
            value={<MoneyDisplay amount={kpis.netSales} />}
            description="Money received today"
            icon={Banknote}
            tone="sales"
            actionHref="/sales"
            actionLabel="View sales"
          />
          <ReportExecutiveKpiCard
            title="Today's Profit"
            value={<MoneyDisplay amount={kpis.netProfit} />}
            description="After all costs"
            icon={TrendingUp}
            tone={profitTone === 'loss' ? 'warning' : 'profit'}
            profitAmount={kpis.netProfit}
            actionHref="/reports"
            actionLabel="View profit report"
          />
          <ReportExecutiveKpiCard
            title="Production"
            value={formatUnits(kpis.productionUnits)}
            description="Completed today"
            icon={Factory}
            tone="production"
            actionHref="/production"
            actionLabel="View production"
          />
          <ReportExecutiveKpiCard
            title="Purchases"
            value={<MoneyDisplay amount={kpis.purchasesTotal} />}
            description="Raw materials received"
            icon={ShoppingCart}
            tone="sales"
            actionHref="/purchases"
            actionLabel="View purchases"
          />
        </ReportExecutiveKpiGrid>
      </section>

      <ReportActionCenter
        items={mapAlertsToActions(data.alerts)}
        emptyDescription="Kitchen operations look on track."
      />

      <ReportProfitFlowSection
        description="How today's sales became profit — step by step."
        steps={[
          { label: 'Sales', amount: kpis.netSales, tone: 'sales' },
          {
            label: 'Cost of Goods Sold',
            amount: kpis.totalCogs,
            description: 'Product cost at time of sale',
            tone: 'expense',
          },
          { label: 'Gross Profit', amount: kpis.grossProfit, tone: 'profit' },
          {
            label: 'Expenses',
            amount: kpis.expensesTotal,
            description: 'Operating costs today',
            tone: 'expense',
          },
          {
            label: 'Wastage',
            amount: kpis.wastageCost,
            description: 'Inventory written off today',
            tone: 'wastage',
          },
          { label: 'Net Profit', amount: kpis.netProfit, tone: 'profit' },
        ]}
      />

      <ReportFinancialDetailsSection description="Additional financial breakdown for today.">
        <div className={reportPrimaryMetricGridClass}>
          <ReportMetricCard
            title="Gross Profit"
            value={<MoneyDisplay amount={kpis.grossProfit} />}
            description="Net sales minus COGS"
            icon={TrendingUp}
            tone="profit"
            profitAmount={kpis.grossProfit}
          />
          <ReportMetricCard
            title="COGS"
            value={<MoneyDisplay amount={kpis.totalCogs} />}
            description="Product cost at time of sale"
            icon={Package}
            tone="expense"
          />
          <ReportMetricCard
            title="Expenses"
            value={<MoneyDisplay amount={kpis.expensesTotal} />}
            description="Operating expenses today"
            icon={Wallet}
            tone="expense"
          />
          <ReportMetricCard
            title="Wastage Cost"
            value={<MoneyDisplay amount={kpis.wastageCost} />}
            description="Inventory written off today"
            icon={Trash2}
            tone="wastage"
          />
        </div>
        <p className="mt-4 text-sm">
          <Link href="/reports" className="font-medium text-primary hover:underline">
            View full profit report →
          </Link>
        </p>
      </ReportFinancialDetailsSection>

      <ReportOperationalMetricsStrip metrics={operationalStrip} />

      <DailySummaryActivitySection activity={data.activity} />
    </div>
  );
}
