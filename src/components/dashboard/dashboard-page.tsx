'use client';

import { DashboardAttentionSection } from '@/components/dashboard/dashboard-attention-section';
import { DashboardHeroSection } from '@/components/dashboard/dashboard-hero-section';
import { DashboardQuickActions } from '@/components/dashboard/dashboard-quick-actions';
import { DashboardRecentActivitySection } from '@/components/dashboard/dashboard-recent-activity-section';
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useDashboard } from '@/hooks/queries/use-dashboard';
import { formatDisplayDate } from '@/lib/utils/date';
import { isOrgConfigError } from '@/lib/utils/user-friendly-error';

export function DashboardPage({
  allowedQuickActionModules,
}: {
  allowedQuickActionModules: readonly string[];
}) {
  const { data, isLoading, error, refetch, isRefetching } = useDashboard();

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const isOrgError = error?.message ? isOrgConfigError(error.message) : false;

  if (error || !data) {
    return (
      <div className="page-stack">
        <PageHeader title="Dashboard" />
        {isOrgError ? (
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
              title="Failed to load dashboard"
              error={error}
              onRetry={() => void refetch()}
              isRetrying={isRefetching}
            />
            {!error ? (
              <Alert variant="destructive">
                <AlertTitle>Dashboard unavailable</AlertTitle>
                <AlertDescription>Unable to load dashboard data.</AlertDescription>
              </Alert>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  const todayLabel = formatDisplayDate(data.summary.todayDate);

  return (
    <div className="page-stack-loose">
      <PageHeader
        title="Dashboard"
        description={`Today is ${todayLabel}. Here is how your bakery is doing.`}
      />

      <DashboardHeroSection summary={data.summary} />

      <DashboardQuickActions allowedModules={allowedQuickActionModules} />

      <div className="grid gap-6 xl:grid-cols-5 xl:gap-8">
        <div className="min-w-0 xl:col-span-3">
          <DashboardAttentionSection
            lowStockProducts={data.lowStockProducts}
            counts={data.quickCounts}
          />
        </div>

        <div className="min-w-0 xl:col-span-2">
          <DashboardRecentActivitySection activity={data.recentActivity} />
        </div>
      </div>
    </div>
  );
}
