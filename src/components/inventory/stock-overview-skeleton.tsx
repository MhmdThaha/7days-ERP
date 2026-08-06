import { Skeleton } from '@/components/ui/skeleton';

export function StockOverviewSkeleton() {
  return (
    <div className="min-w-0 space-y-10" aria-busy="true" aria-label="Loading stock overview">
      <Skeleton className="h-10 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
