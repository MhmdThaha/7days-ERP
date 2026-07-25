import { Skeleton } from '@/components/ui/skeleton';

export function DashboardSkeleton() {
  return (
    <div className="page-stack-loose" aria-busy="true" aria-label="Loading dashboard">
      <div className="space-y-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>

      <div className="section-stack">
        <Skeleton className="h-7 w-56" />
        <div className="grid gap-4 lg:grid-cols-12">
          <Skeleton className="h-44 rounded-xl lg:col-span-5" />
          <div className="grid gap-3 sm:grid-cols-3 lg:col-span-7 lg:grid-cols-1 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-32 rounded-xl" />
            ))}
          </div>
        </div>
      </div>

      <div className="section-stack">
        <Skeleton className="h-7 w-52" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-5 xl:gap-8">
        <div className="space-y-6 xl:col-span-3">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
        <div className="space-y-3 xl:col-span-2">
          <Skeleton className="h-7 w-40" />
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
