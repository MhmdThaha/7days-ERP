'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, SearchX } from 'lucide-react';
import { toast } from 'sonner';

import { completeReturnAction, deleteReturnAction } from '@/actions/returns';
import { ReturnFilters } from '@/components/returns/return-filters';
import { ReturnTable } from '@/components/returns/return-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RETURN_PAGE_SIZE } from '@/lib/domain/constants/return';
import { useReturns } from '@/hooks/queries/use-returns';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries } from '@/lib/utils/query-invalidation';
import { toastFormError } from '@/lib/utils/toast-form-error';
import { toastWorkflowComplete } from '@/lib/utils/workflow-toasts';
import type { ReturnListItem } from '@/types/return';

export function ReturnsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deletingReturn, setDeletingReturn] = useState<ReturnListItem | null>(null);
  const [completingReturn, setCompletingReturn] = useState<ReturnListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isFetching, error, refetch, isRefetching } = useReturns({
    search: debouncedSearch,
    page,
    pageSize: RETURN_PAGE_SIZE,
  });

  const isSearching = search !== debouncedSearch;
  const hasActiveFilters = Boolean(debouncedSearch.trim());
  const showEmptyCatalog = !isLoading && !error && data?.total === 0 && !hasActiveFilters;
  const showNoResults = !isLoading && !error && data?.total === 0 && hasActiveFilters;
  const isOrgError = error?.message.includes('Organization context is not configured');
  const isBusy = isDeleting || isCompleting;

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
        toastFormError(result.error);
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

  async function handleComplete() {
    if (!completingReturn || isCompleting) {
      return;
    }

    setIsCompleting(true);

    try {
      const result = await completeReturnAction(completingReturn.id);

      if (!result.success) {
        toastFormError(result.error);
        return;
      }

      toastWorkflowComplete('Return completed. Product stock has been restored.', {
        recordAnother: {
          label: 'Record another',
          onClick: () => router.push('/returns/new'),
        },
      });
      setCompletingReturn(null);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['returns'] }),
        queryClient.invalidateQueries({ queryKey: ['return-entry', completingReturn.id] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);
    } finally {
      setIsCompleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Returns"
        description="Record product return drafts from shops and customers. Inventory is restored when you complete a return."
      >
        {!showEmptyCatalog ? (
          <Button nativeButton={false} render={<Link href="/returns/new" />}>
            <Plus />
            Record Return
          </Button>
        ) : null}
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
        disabled={isLoading || isBusy}
        onSearchChange={setSearch}
      />

      {error && !isOrgError ? (
        <LoadErrorAlert
          title="Failed to load returns"
          error={error}
          onRetry={() => void refetch()}
          isRetrying={isRefetching}
        />
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
              disabled={isBusy}
              onDelete={(returnEntry) => setDeletingReturn(returnEntry)}
              onComplete={(returnEntry) => setCompletingReturn(returnEntry)}
            />
          )}

          {data && data.total > 0 ? (
            <DataTablePagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              pageSize={data.pageSize}
              entityName="returns"
              disabled={isFetching || isBusy}
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

      <ConfirmDialog
        open={Boolean(completingReturn)}
        onOpenChange={(open) => {
          if (isCompleting) {
            return;
          }

          if (!open) {
            setCompletingReturn(null);
          }
        }}
        title="Complete Return"
        description={
          completingReturn
            ? `Complete "${completingReturn.returnNumber}"? Product stock will be restored for ${completingReturn.lineCount} line${completingReturn.lineCount === 1 ? '' : 's'}. This cannot be undone.`
            : ''
        }
        confirmLabel="Complete Return"
        loadingLabel="Completing..."
        isLoading={isCompleting}
        onConfirm={handleComplete}
      />
    </div>
  );
}
