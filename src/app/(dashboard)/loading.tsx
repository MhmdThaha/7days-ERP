import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
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
