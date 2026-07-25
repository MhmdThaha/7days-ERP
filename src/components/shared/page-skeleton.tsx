import { Skeleton } from '@/components/ui/skeleton';
import { pageStackLoose } from '@/lib/ui/layout';
import { cn } from '@/lib/utils';

type PageSkeletonProps = {
  titleWidth?: string;
  className?: string;
  children?: React.ReactNode;
};

export function PageSkeleton({ titleWidth = 'w-48', className, children }: PageSkeletonProps) {
  return (
    <div className={cn(pageStackLoose, className)} aria-busy="true" aria-label="Loading page">
      <Skeleton className={cn('h-10', titleWidth)} />
      {children}
    </div>
  );
}

type ListPageSkeletonProps = {
  columns?: number;
  rows?: number;
  showFilters?: boolean;
};

export function ListPageSkeleton({
  columns = 6,
  rows = 5,
  showFilters = true,
}: ListPageSkeletonProps) {
  return (
    <PageSkeleton titleWidth="w-56">
      {showFilters ? <Skeleton className="h-10 w-full max-w-2xl rounded-lg" /> : null}
      <div className="table-shell">
        <div className="space-y-0">
          <div className="flex gap-4 border-b bg-muted/40 px-3 py-3">
            {Array.from({ length: columns }).map((_, index) => (
              <Skeleton key={`head-${index}`} className="h-4 flex-1" />
            ))}
          </div>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <div key={`row-${rowIndex}`} className="flex gap-4 border-b px-3 py-4 last:border-b-0">
              {Array.from({ length: columns }).map((_, colIndex) => (
                <Skeleton key={`cell-${rowIndex}-${colIndex}`} className="h-4 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </PageSkeleton>
  );
}
