'use client';

import { MonthlyReportAnalyticsSection } from '@/components/reports/monthly-report-analytics-section';
import { MonthlyReportComparisonSection } from '@/components/reports/monthly-report-comparison-section';
import { MonthlyReportExecutiveKpisSection } from '@/components/reports/monthly-report-executive-kpis-section';
import { MonthlyReportInsightsSection } from '@/components/reports/monthly-report-insights-section';
import { MonthlyReportPlSection } from '@/components/reports/monthly-report-pl-section';
import { MonthlyReportRankingsSection } from '@/components/reports/monthly-report-rankings-section';
import { MonthlyReportSkeleton } from '@/components/reports/monthly-report-skeleton';
import { MonthlyReportTransactionsSection } from '@/components/reports/monthly-report-transactions-section';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useMonthlyReport } from '@/hooks/queries/use-monthly-report';

export function MonthlyReportPage() {
  const { data, isLoading, isFetching, error } = useMonthlyReport();
  const showSkeleton = isLoading || (isFetching && !data);

  if (showSkeleton) {
    return <MonthlyReportSkeleton />;
  }

  const isOrgError = error?.message.includes('Organization context is not configured');
  const isUnauthorized = error?.message.includes('permission to view reports');

  if (error || !data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Monthly Summary"
          description="Executive dashboard for bakery owners."
        />
        {isUnauthorized ? (
          <AccessDenied description="Monthly Summary is available to owners and managers only." />
        ) : isOrgError ? (
          <Alert variant="destructive">
            <AlertTitle>Configuration required</AlertTitle>
            <AlertDescription>
              Set <code className="font-mono text-sm">DEV_ORG_ID</code> in your{' '}
              <code className="font-mono text-sm">.env.local</code> file to connect to Firestore.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <AlertTitle>Failed to load monthly summary</AlertTitle>
            <AlertDescription>
              {error?.message ?? 'Unable to load monthly report data.'}
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-10">
      <PageHeader
        title="Monthly Summary"
        description={`Executive dashboard for ${data.monthLabel}.`}
      />

      <MonthlyReportInsightsSection insights={data.insights} />

      <MonthlyReportExecutiveKpisSection kpis={data.executiveKpis} />

      <MonthlyReportPlSection monthLabel={data.monthLabel} summary={data.summary} />

      <MonthlyReportComparisonSection
        monthLabel={data.monthLabel}
        comparison={data.comparison}
      />

      <MonthlyReportAnalyticsSection
        monthLabel={data.monthLabel}
        dailyAnalytics={data.dailyAnalytics}
        expenseBreakdown={data.expenseBreakdown}
        wastageBreakdown={data.wastageBreakdown}
      />

      <MonthlyReportRankingsSection
        topSellingProducts={data.topSellingProducts}
        topRevenueProducts={data.topRevenueProducts}
        topWastageProducts={data.topWastageProducts}
      />

      <MonthlyReportTransactionsSection transactions={data.transactions} />
    </div>
  );
}
