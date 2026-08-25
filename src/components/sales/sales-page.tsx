'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, SearchX, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { completeSaleAction, deleteSaleAction } from '@/actions/sales';
import { SaleFilters } from '@/components/sales/sale-filters';
import { SaleTable } from '@/components/sales/sale-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SALE_PAGE_SIZE } from '@/lib/domain/constants/sale';
import { cn } from '@/lib/utils';
import { useSales } from '@/hooks/queries/use-sales';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries, invalidateProductStockQueries } from '@/lib/utils/query-invalidation';
import { clearModuleWorkflowResumeForRecord } from '@/lib/navigation/module-workflow-resume';
import { useStatusFilterFromSearchParams } from '@/lib/utils/list-url-filters';
import { toastFormError } from '@/lib/utils/toast-form-error';
import { toastWorkflowComplete } from '@/lib/utils/workflow-toasts';
import type { SaleListItem, SaleListPagePosition, SalePageCursor, SaleStatusFilter } from '@/types/sale';

function getSaleListSummary(status: SaleStatusFilter, total: number): string {
  if (status === 'draft') {
    return total === 1
      ? '1 draft — complete to update stock'
      : `${total.toLocaleString('en-IN')} drafts — complete to update stock`;
  }

  if (status === 'completed') {
    return total === 1
      ? '1 completed sale'
      : `${total.toLocaleString('en-IN')} completed sales`;
  }

  return total === 1 ? '1 sale' : `${total.toLocaleString('en-IN')} sales`;
}

export function SalesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [position, setPosition] = useState<SaleListPagePosition>('first');
  const [cursor, setCursor] = useState<SalePageCursor | null>(null);
  const [pageEdgeCursors, setPageEdgeCursors] = useState<{
    start: SalePageCursor | null;
    end: SalePageCursor | null;
  }>({ start: null, end: null });

  const resetPagination = useCallback(() => {
    setPage(1);
    setPosition('first');
    setCursor(null);
  }, []);

  const [status, setStatus] = useStatusFilterFromSearchParams(
    searchParams,
    ['all', 'draft', 'completed'],
    'all',
    resetPagination,
  );
  const [deletingSale, setDeletingSale] = useState<SaleListItem | null>(null);
  const [completingSale, setCompletingSale] = useState<SaleListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      resetPagination();
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search, resetPagination]);

  const { data, isLoading, isFetching, error, refetch, isRefetching } = useSales({
    search: debouncedSearch,
    status,
    page,
    pageSize: SALE_PAGE_SIZE,
    position,
    cursor,
  });

  useEffect(() => {
    if (!data) {
      return;
    }

    setPageEdgeCursors({
      start: data.startCursor,
      end: data.endCursor,
    });
  }, [data]);

  const isSearching = search !== debouncedSearch;
  const hasActiveFilters = Boolean(debouncedSearch.trim()) || status !== 'all';
  const showEmptyCatalog = !isLoading && !error && data?.total === 0 && !hasActiveFilters;
  const showNoResults = !isLoading && !error && data?.total === 0 && hasActiveFilters;
  const isOrgError = error?.message.includes('Organization context is not configured');
  const isBusy = isDeleting || isCompleting;
  const hasSearch = Boolean(debouncedSearch.trim());

  function clearFilters() {
    setSearch('');
    setDebouncedSearch('');
    setStatus('all');
    resetPagination();
  }

  function handlePageChange(newPage: number) {
    if (hasSearch) {
      setPage(newPage);
      setPosition('first');
      setCursor(null);
      return;
    }

    const totalPages = data?.totalPages ?? 1;

    if (newPage <= 1) {
      setPage(1);
      setPosition('first');
      setCursor(null);
      return;
    }

    if (newPage >= totalPages) {
      if (newPage === page + 1 && pageEdgeCursors.end) {
        setPage(newPage);
        setPosition('next');
        setCursor(pageEdgeCursors.end);
        return;
      }

      setPage(totalPages);
      setPosition('last');
      setCursor(null);
      return;
    }

    if (newPage === page + 1) {
      setPage(newPage);
      setPosition('next');
      setCursor(pageEdgeCursors.end);
      return;
    }

    if (newPage === page - 1) {
      setPage(newPage);
      setPosition('prev');
      setCursor(pageEdgeCursors.start);
      return;
    }

    setPage(newPage);
    setPosition('first');
    setCursor(null);
  }

  async function handleDelete() {
    if (!deletingSale || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deleteSaleAction(deletingSale.id);

      if (!result.success) {
        toastFormError(result.error);
        return;
      }

      clearModuleWorkflowResumeForRecord('sales', deletingSale.id);
      toast.success('Sale draft deleted successfully');
      setDeletingSale(null);

      if (data?.items.length === 1 && page > 1) {
        if (page - 1 <= 1) {
          setPage(1);
          setPosition('first');
          setCursor(null);
        } else {
          setPage(page - 1);
          setPosition('prev');
          setCursor(pageEdgeCursors.start);
        }
      } else if (page <= 1) {
        setPosition('first');
        setCursor(null);
      } else if (page >= (data?.totalPages ?? 1)) {
        setPosition('last');
        setCursor(null);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleComplete() {
    if (!completingSale || isCompleting) {
      return;
    }

    setIsCompleting(true);

    try {
      const result = await completeSaleAction(completingSale.id);

      if (!result.success) {
        toastFormError(result.error);
        return;
      }

      clearModuleWorkflowResumeForRecord('sales', completingSale.id);
      toastWorkflowComplete('Sale completed. Product stock has been updated.', {
        recordAnother: {
          label: 'Record another',
          onClick: () => router.push('/sales/new'),
        },
      });
      setCompletingSale(null);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
        queryClient.invalidateQueries({ queryKey: ['sale', completingSale.id] }),
        invalidateProductStockQueries(queryClient),
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
        title="Sales"
        description="Record sales drafts for shop deliveries and customer orders. Inventory is updated when you complete a sale."
      >
        {!showEmptyCatalog ? (
          <>
            <Button nativeButton={false} variant="outline" render={<Link href="/sales/import" />}>
              <Upload />
              Import Sales
            </Button>
            <Button nativeButton={false} variant="success" size="xl" render={<Link href="/sales/new" />}>
              <Plus />
              Record Sale
            </Button>
          </>
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

      <SaleFilters
        search={search}
        status={status}
        isSearching={isSearching}
        disabled={isLoading || isBusy}
        onSearchChange={setSearch}
        onStatusChange={(value) => {
          setStatus(value);
          resetPagination();
        }}
      />

      {error && !isOrgError ? (
        <LoadErrorAlert
          title="Failed to load sales"
          error={error}
          onRetry={() => void refetch()}
          isRetrying={isRefetching}
        />
      ) : null}

      {!showEmptyCatalog && !showNoResults && data && data.total > 0 ? (
        <div
          className={cn(
            'rounded-lg border bg-muted/30 px-4 py-3 text-base font-medium',
            status === 'draft' && 'text-warning-foreground',
            status === 'completed' && 'text-success-foreground',
          )}
        >
          {getSaleListSummary(status, data.total)}
        </div>
      ) : null}

      {showEmptyCatalog ? (
        <EmptyState
          title="No sales drafts yet"
          description="Record your first sale to track what was delivered or sold today."
          actionLabel="Record Sale"
          onAction={() => router.push('/sales/new')}
        />
      ) : (
        <>
          {showNoResults ? (
            <EmptyState
              icon={SearchX}
              title="No matching records."
              description="Try clearing your filters to see all sales."
              actionLabel="Clear Filters"
              onAction={clearFilters}
            />
          ) : (
            <SaleTable
              sales={data?.items ?? []}
              isLoading={isLoading}
              isFetching={isFetching}
              disabled={isBusy}
              onDelete={(sale) => setDeletingSale(sale)}
              onComplete={(sale) => setCompletingSale(sale)}
            />
          )}

          {data && data.total > 0 ? (
            <DataTablePagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              pageSize={data.pageSize}
              entityName="sales"
              disabled={isFetching || isBusy}
              onPageChange={handlePageChange}
            />
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={Boolean(deletingSale)}
        onOpenChange={(open) => {
          if (isDeleting) {
            return;
          }

          if (!open) {
            setDeletingSale(null);
          }
        }}
        title="Delete sale draft?"
        description={
          deletingSale
            ? `This will soft-delete "${deletingSale.saleNumber}". It will no longer appear in active lists but historical data is preserved.`
            : ''
        }
        confirmLabel="Delete"
        confirmVariant="destructive"
        loadingLabel="Deleting..."
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={Boolean(completingSale)}
        onOpenChange={(open) => {
          if (isCompleting) {
            return;
          }

          if (!open) {
            setCompletingSale(null);
          }
        }}
        title="Complete Sale"
        description={
          completingSale
            ? `Complete "${completingSale.saleNumber}"? Product stock will be deducted for ${completingSale.lineCount} line${completingSale.lineCount === 1 ? '' : 's'}. This cannot be undone.`
            : ''
        }
        confirmLabel="Complete Sale"
        confirmVariant="success"
        loadingLabel="Completing..."
        isLoading={isCompleting}
        onConfirm={handleComplete}
      />
    </div>
  );
}
