'use client';

import { DashboardActionCenter } from '@/components/dashboard/dashboard-action-center';
import { DashboardExecutiveHeader } from '@/components/dashboard/dashboard-executive-header';
import { DashboardExecutiveInsightCard } from '@/components/dashboard/dashboard-executive-insight-card';
import { DashboardKpiSection } from '@/components/dashboard/dashboard-kpi-section';
import { DashboardQuickActions } from '@/components/dashboard/dashboard-quick-actions';
import { DashboardRecentActivitySection } from '@/components/dashboard/dashboard-recent-activity-section';
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useDashboard } from '@/hooks/queries/use-dashboard';
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
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Dashboard</h1>
        </div>
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

  const pendingDraftTotal =
    data.quickCounts.draftPurchases +
    data.quickCounts.draftProduction +
    data.quickCounts.draftSales +
    data.quickCounts.draftExpenses;

  return (
    <div className="page-stack-loose">
      <DashboardExecutiveHeader
        todayDate={data.summary.todayDate}
        lowStockCount={data.lowStockProducts.length}
        pendingDraftTotal={pendingDraftTotal}
      />

      <DashboardKpiSection summary={data.summary} counts={data.quickCounts} />

      <DashboardActionCenter lowStockProducts={data.lowStockProducts} counts={data.quickCounts} />

      <DashboardQuickActions allowedModules={allowedQuickActionModules} />

      <DashboardExecutiveInsightCard
        summary={data.summary}
        lowStockCount={data.lowStockProducts.length}
        counts={data.quickCounts}
      />

      <DashboardRecentActivitySection activity={data.recentActivity} />
    </div>
  );
}
