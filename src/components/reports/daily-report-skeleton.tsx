import { Skeleton } from '@/components/ui/skeleton';

export function DailyReportSkeleton() {
  return (
    <div className="page-stack-loose" aria-busy="true" aria-label="Loading daily report">
      <div className="space-y-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-72 max-w-full" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>

      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-40 rounded-xl" />
        ))}
      </div>

      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-80 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
