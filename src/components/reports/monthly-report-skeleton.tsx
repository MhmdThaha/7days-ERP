import { Skeleton } from '@/components/ui/skeleton';

export function MonthlyReportSkeleton() {
  return (
    <div className="min-w-0 space-y-10" aria-busy="true" aria-label="Loading monthly summary">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={`insight-${index}`} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, index) => (
          <Skeleton key={`kpi-${index}`} className="h-32 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 9 }).map((_, index) => (
          <Skeleton key={`pl-${index}`} className="h-32 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={`comparison-${index}`} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={`analytics-${index}`} className="h-64 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={`ranking-${index}`} className="h-72 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
