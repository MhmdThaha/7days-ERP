'use client';

import {
  Banknote,
  Factory,
  Package,
  RotateCcw,
  TrendingUp,
  Trash2,
  Wallet,
} from 'lucide-react';

import { AccessDenied } from '@/components/shared/access-denied';
import { DailyReportTransactionsSection } from '@/components/reports/daily-report-transactions-section';
import { ReportMetricCard } from '@/components/reports/report-metric-card';
import { MoneyDisplay } from '@/components/shared/money-display';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useDailyReport } from '@/hooks/queries/use-daily-report';
import { formatDisplayDate } from '@/lib/utils/date';

function formatUnits(value: number): string {
  return `${value.toLocaleString('en-IN')} units`;
}

function DailyReportSkeleton() {
  return (
    <div className="min-w-0 space-y-10" aria-busy="true" aria-label="Loading daily report">
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-6 w-44" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

export function DailyReportPage() {
  const { data, isLoading, error, refetch, isRefetching } = useDailyReport();

  if (isLoading) {
    return <DailyReportSkeleton />;
  }

  const isOrgError = error?.message.includes('Organization context is not configured');
  const isUnauthorized = error?.message.includes('permission to view reports');

  if (error || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Today's Report" description="Daily business performance summary." />
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

  const dateLabel = formatDisplayDate(data.reportDate);
  const transactionCount = data.transactions.length;

  return (
    <div className="min-w-0 space-y-10">
      <PageHeader
        title="Today's Report"
        description="Daily business performance summary for your bakery."
      />

      <section
        aria-labelledby="daily-report-summary-heading"
        className="rounded-xl border bg-muted/20 px-4 py-5 sm:px-6"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="daily-report-summary-heading" className="text-lg font-semibold tracking-tight">
              Today&apos;s Summary
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Report for {dateLabel} — completed transactions only.
            </p>
          </div>
          <div className="rounded-lg border bg-background px-4 py-3 text-center sm:text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Transactions today
            </p>
            <p className="text-2xl font-bold tabular-nums">{transactionCount.toLocaleString('en-IN')}</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="daily-report-financial-heading" className="space-y-4">
        <div className="flex items-center gap-2">
          <Banknote className="size-5 text-primary" aria-hidden="true" />
          <h2 id="daily-report-financial-heading" className="text-lg font-semibold tracking-tight">
            Financial Summary
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ReportMetricCard
            title="Net Sales"
            value={<MoneyDisplay amount={data.financial.netSales} />}
            description={`${data.sales.count.toLocaleString('en-IN')} completed sale${data.sales.count === 1 ? '' : 's'}`}
            icon={Banknote}
          />
          <ReportMetricCard
            title="Cost of Goods Sold"
            value={<MoneyDisplay amount={data.financial.totalCogs} />}
            description="Product cost at time of sale"
            icon={Package}
          />
          <ReportMetricCard
            title="Gross Profit"
            value={<MoneyDisplay amount={data.financial.grossProfit} />}
            description="Net sales minus COGS"
            icon={TrendingUp}
          />
          <ReportMetricCard
            title="Expenses"
            value={<MoneyDisplay amount={data.financial.expensesTotal} />}
            description={`${data.expenses.count.toLocaleString('en-IN')} completed expense${data.expenses.count === 1 ? '' : 's'}`}
            icon={Wallet}
          />
          <ReportMetricCard
            title="Wastage Cost"
            value={<MoneyDisplay amount={data.financial.wastageCost} />}
            description="Inventory written off today"
            icon={Trash2}
          />
          <ReportMetricCard
            title="Net Profit"
            value={<MoneyDisplay amount={data.financial.netProfit} />}
            description="Gross profit minus expenses and wastage"
            icon={TrendingUp}
            variant="emphasis"
          />
        </div>
      </section>

      <section aria-labelledby="daily-report-operations-heading" className="space-y-4">
        <div className="flex items-center gap-2">
          <Factory className="size-5 text-muted-foreground" aria-hidden="true" />
          <h2 id="daily-report-operations-heading" className="text-lg font-semibold tracking-tight">
            Operations Summary
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ReportMetricCard
            title="Today's Production"
            value={formatUnits(data.production.totalUnits)}
            description={`${data.production.batchCount.toLocaleString('en-IN')} completed batch${data.production.batchCount === 1 ? '' : 'es'}`}
            icon={Factory}
          />
          <ReportMetricCard
            title="Today's Wastage"
            value={formatUnits(data.wastage.totalUnits)}
            description="Completed wastage written off today"
            icon={Trash2}
          />
          <ReportMetricCard
            title="Today's Returns"
            value={formatUnits(data.returns.totalUnits)}
            description="Completed returns received today"
            icon={RotateCcw}
          />
        </div>
      </section>

      <DailyReportTransactionsSection transactions={data.transactions} />
    </div>
  );
}
