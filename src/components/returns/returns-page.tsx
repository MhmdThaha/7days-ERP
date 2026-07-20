'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, SearchX } from 'lucide-react';
import { toast } from 'sonner';

import { deleteReturnAction } from '@/actions/returns';
import { ReturnFilters } from '@/components/returns/return-filters';
import { ReturnTable } from '@/components/returns/return-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RETURN_PAGE_SIZE } from '@/lib/domain/constants/return';
import { useReturns } from '@/hooks/queries/use-returns';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries } from '@/lib/utils/query-invalidation';
import type { ReturnListItem } from '@/types/return';

export function ReturnsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deletingReturn, setDeletingReturn] = useState<ReturnListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isFetching, error } = useReturns({
    search: debouncedSearch,
    page,
    pageSize: RETURN_PAGE_SIZE,
  });

  const isSearching = search !== debouncedSearch;
  const hasActiveFilters = Boolean(debouncedSearch.trim());
  const showEmptyCatalog = !isLoading && !error && data?.total === 0 && !hasActiveFilters;
  const showNoResults = !isLoading && !error && data?.total === 0 && hasActiveFilters;
  const isOrgError = error?.message.includes('Organization context is not configured');

  function clearFilters() {
    setSearch('');
    setDebouncedSearch('');
    setPage(1);
  }

  async function handleDelete() {
    if (!deletingReturn || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deleteReturnAction(deletingReturn.id);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success('Return draft deleted successfully');
      setDeletingReturn(null);

      if (data?.items.length === 1 && page > 1) {
        setPage((currentPage) => currentPage - 1);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['returns'] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Returns"
        description="Record product return drafts from shops and customers. Inventory is updated when completing a return in a later phase."
      >
        <Button nativeButton={false} render={<Link href="/returns/new" />}>
          <Plus />
          Record Return
        </Button>
      </PageHeader>

      {isOrgError ? (
        <Alert variant="destructive">
          <AlertTitle>Configuration required</AlertTitle>
          <AlertDescription>
            Set <code className="font-mono text-sm">DEV_ORG_ID</code> in your{' '}
            <code className="font-mono text-sm">.env.local</code> file to connect to Firestore.
          </AlertDescription>
        </Alert>
      ) : null}

      <ReturnFilters
        search={search}
        isSearching={isSearching}
        disabled={isLoading || isDeleting}
        onSearchChange={setSearch}
      />

      {error && !isOrgError ? (
        <Alert variant="destructive">
          <AlertTitle>Failed to load returns</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}

      {showEmptyCatalog ? (
        <EmptyState
          title="No return drafts yet"
          description="Record your first return to track products coming back from shops or customers."
          actionLabel="Record Return"
          onAction={() => router.push('/returns/new')}
        />
      ) : (
        <>
          {showNoResults ? (
            <EmptyState
              icon={SearchX}
              title="No matching records."
              description="Try clearing your filters to see all returns."
              actionLabel="Clear Filters"
              onAction={clearFilters}
            />
          ) : (
            <ReturnTable
              returns={data?.items ?? []}
              isLoading={isLoading}
              isFetching={isFetching}
              disabled={isDeleting}
              onDelete={(returnEntry) => setDeletingReturn(returnEntry)}
            />
          )}

          {data && data.total > 0 ? (
            <DataTablePagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              pageSize={data.pageSize}
              entityName="returns"
              disabled={isFetching || isDeleting}
              onPageChange={setPage}
            />
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={Boolean(deletingReturn)}
        onOpenChange={(open) => {
          if (isDeleting) {
            return;
          }

          if (!open) {
            setDeletingReturn(null);
          }
        }}
        title="Delete return draft?"
        description={
          deletingReturn
            ? `This will soft-delete "${deletingReturn.returnNumber}". It will no longer appear in active lists but historical data is preserved.`
            : ''
        }
        confirmLabel="Delete"
        confirmVariant="destructive"
        loadingLabel="Deleting..."
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
