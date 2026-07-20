'use client';

import { DailySummaryActivitySection } from '@/components/daily-summary/daily-summary-activity-section';
import { DailySummaryAlertsSection } from '@/components/daily-summary/daily-summary-alerts-section';
import { DailySummaryKpisSection } from '@/components/daily-summary/daily-summary-kpis-section';
import { DailySummaryOperationalMetricsSection } from '@/components/daily-summary/daily-summary-operational-metrics-section';
import { DailySummaryQuickSummarySection } from '@/components/daily-summary/daily-summary-quick-summary-section';
import { DailySummarySkeleton } from '@/components/daily-summary/daily-summary-skeleton';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useDailySummaryDashboard } from '@/hooks/queries/use-daily-summary-dashboard';
import { formatDisplayDate } from '@/lib/utils/date';

export function DailySummaryPage() {
  const { data, isLoading, isFetching, error } = useDailySummaryDashboard();
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
          title="Daily Summary"
          description="Today's operational dashboard for your bakery."
        />
        {isUnauthorized ? (
          <AccessDenied description="Daily Summary is available to owners, managers, and production staff." />
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
            <AlertTitle>Failed to load daily summary</AlertTitle>
            <AlertDescription>
              {error?.message ?? 'Unable to load daily summary data.'}
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  const dateLabel = formatDisplayDate(data.reportDate);

  return (
    <div className="min-w-0 space-y-10">
      <PageHeader
        title="Daily Summary"
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
