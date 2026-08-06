import { Skeleton } from '@/components/ui/skeleton';

export function DashboardSkeleton() {
  return (
    <div className="page-stack-loose" aria-busy="true" aria-label="Loading dashboard">
      <div className="space-y-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-72 max-w-full" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-xl" />
        ))}
      </div>

      <div className="section-stack">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>

      <div className="section-stack">
        <Skeleton className="h-7 w-52" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>

      <Skeleton className="h-56 w-full rounded-xl" />

      <div className="section-stack">
        <Skeleton className="h-7 w-40" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
