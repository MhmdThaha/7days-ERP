'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type DataTablePaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  entityName?: string;
  disabled?: boolean;
  onPageChange: (page: number) => void;
};

export function DataTablePagination({
  page,
  totalPages,
  total,
  pageSize,
  entityName = 'items',
  disabled = false,
  onPageChange,
}: DataTablePaginationProps) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
        disabled && 'pointer-events-none opacity-60',
      )}
      aria-busy={disabled}
    >
      <p className="text-sm text-muted-foreground">
        Showing {start}–{end} of {total} {entityName}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(1)}
          disabled={disabled || page <= 1}
          aria-label="Go to first page"
        >
          First
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || page <= 1}
          aria-label="Go to previous page"
        >
          Previous
        </Button>
        <span className="min-w-[88px] text-center text-sm text-muted-foreground" aria-live="polite">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || page >= totalPages}
          aria-label="Go to next page"
        >
          Next
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(totalPages)}
          disabled={disabled || page >= totalPages}
          aria-label="Go to last page"
        >
          Last
        </Button>
      </div>
    </div>
  );
}
