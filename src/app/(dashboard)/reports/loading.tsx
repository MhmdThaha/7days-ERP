import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="min-w-0 space-y-10" aria-busy="true" aria-label="Loading daily report">
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
