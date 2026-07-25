'use client';

import { DailySummaryActivitySection } from '@/components/daily-summary/daily-summary-activity-section';
import { DailySummaryAlertsSection } from '@/components/daily-summary/daily-summary-alerts-section';
import { DailySummaryKpisSection } from '@/components/daily-summary/daily-summary-kpis-section';
import { DailySummaryOperationalMetricsSection } from '@/components/daily-summary/daily-summary-operational-metrics-section';
import { DailySummaryQuickSummarySection } from '@/components/daily-summary/daily-summary-quick-summary-section';
import { DailySummarySkeleton } from '@/components/daily-summary/daily-summary-skeleton';
import { AccessDenied } from '@/components/shared/access-denied';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useDailySummaryDashboard } from '@/hooks/queries/use-daily-summary-dashboard';
import { formatDisplayDate } from '@/lib/utils/date';

export function DailySummaryPage() {
  const { data, isLoading, isFetching, error, refetch, isRefetching } = useDailySummaryDashboard();
  const showSkeleton = isLoading || (isFetching && !data);

  if (showSkeleton) {
    return <DailySummarySkeleton />;
  }

  const isOrgError = error?.message.includes('Organization context is not configured');
  const isUnauthorized = error?.message.includes('permission to view the daily summary');

  if (error || !data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Kitchen Dashboard"
          description="Today's operational dashboard for your bakery."
        />
        {isUnauthorized ? (
          <AccessDenied description="Kitchen Dashboard is available to owners, managers, and production staff." />
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

  const dateLabel = formatDisplayDate(data.reportDate);

  return (
    <div className="min-w-0 space-y-10">
      <PageHeader
        title="Kitchen Dashboard"
        description={`Operational dashboard for ${dateLabel}.`}
      />

      <DailySummaryQuickSummarySection items={data.quickSummary} />

      <DailySummaryAlertsSection alerts={data.alerts} />

      <DailySummaryKpisSection kpis={data.kpis} />

      <DailySummaryOperationalMetricsSection metrics={data.operationalMetrics} />

      <DailySummaryActivitySection activity={data.activity} />
    </div>
  );
}
