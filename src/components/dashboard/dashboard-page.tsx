'use client';

import { DashboardLowStockSection } from '@/components/dashboard/dashboard-low-stock-section';
import { DashboardQuickActions } from '@/components/dashboard/dashboard-quick-actions';
import { DashboardQuickCountsSection } from '@/components/dashboard/dashboard-quick-counts';
import { DashboardRecentActivitySection } from '@/components/dashboard/dashboard-recent-activity-section';
import { DashboardSummaryCards } from '@/components/dashboard/dashboard-summary-cards';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboard } from '@/hooks/queries/use-dashboard';
import { formatDisplayDate } from '@/lib/utils/date';

function DashboardSkeleton() {
  return (
    <div className="min-w-0 space-y-10" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="h-10 w-48" />
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-36 rounded-xl" />
          ))}
        </div>
      </div>
      <Skeleton className="h-10 w-full max-w-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <div className="grid gap-4 border-t pt-8 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-48 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function DashboardPage({ allowedQuickActionModules }: { allowedQuickActionModules: readonly string[] }) {
  const { data, isLoading, error } = useDashboard();

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const isOrgError = error?.message.includes('Organization context is not configured');

  if (error || !data) {
    return (
      <div className="space-y-6">
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
          <Alert variant="destructive">
            <AlertTitle>Failed to load dashboard</AlertTitle>
            <AlertDescription>{error?.message ?? 'Unable to load dashboard data.'}</AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-10">
      <PageHeader
        title="Dashboard"
        description={`Here's how your bakery is doing on ${formatDisplayDate(data.summary.todayDate)}.`}
      />

      <DashboardSummaryCards summary={data.summary} />

      <DashboardQuickActions allowedModules={allowedQuickActionModules} />

      <DashboardQuickCountsSection counts={data.quickCounts} />

      <DashboardLowStockSection products={data.lowStockProducts} />

      <DashboardRecentActivitySection activity={data.recentActivity} />
    </div>
  );
}
