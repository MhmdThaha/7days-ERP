import { Skeleton } from '@/components/ui/skeleton';

export function MonthlyReportSkeleton() {
  return (
    <div className="page-stack-loose" aria-busy="true" aria-label="Loading monthly summary">
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={`kpi-${index}`} className="h-48 rounded-xl" />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={`chart-${index}`} className="h-72 rounded-xl" />
        ))}
      </div>

      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-96 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={`ops-${index}`} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
