'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, SearchX } from 'lucide-react';
import { toast } from 'sonner';

import { completeProductionAction, deleteProductionAction } from '@/actions/production';
import { ProductionFilters } from '@/components/production/production-filters';
import { ProductionTable } from '@/components/production/production-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PRODUCTION_PAGE_SIZE } from '@/lib/domain/constants/production';
import { cn } from '@/lib/utils';
import { useProductions } from '@/hooks/queries/use-productions';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries } from '@/lib/utils/query-invalidation';
import { useStatusFilterFromSearchParams } from '@/lib/utils/list-url-filters';
import { toastFormError } from '@/lib/utils/toast-form-error';
import { toastWorkflowComplete } from '@/lib/utils/workflow-toasts';
import type { ProductionListItem, ProductionStatusFilter } from '@/types/production';

function getProductionListSummary(status: ProductionStatusFilter, total: number): string {
  if (status === 'draft') {
    return total === 1
      ? '1 draft — finish to update stock'
      : `${total.toLocaleString('en-IN')} drafts — finish to update stock`;
  }

  if (status === 'completed') {
    return total === 1
      ? '1 finished production'
      : `${total.toLocaleString('en-IN')} finished productions`;
  }

  return total === 1 ? '1 production' : `${total.toLocaleString('en-IN')} productions`;
}

export function ProductionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const resetPage = useCallback(() => setPage(1), []);
  const [status, setStatus] = useStatusFilterFromSearchParams(
    searchParams,
    ['all', 'draft', 'completed'],
    'all',
    resetPage,
  );
  const [deletingProduction, setDeletingProduction] = useState<ProductionListItem | null>(null);
  const [completingProduction, setCompletingProduction] = useState<ProductionListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isFetching, error, refetch, isRefetching } = useProductions({
    search: debouncedSearch,
    status,
    page,
    pageSize: PRODUCTION_PAGE_SIZE,
  });

  const isSearching = search !== debouncedSearch;
  const hasActiveFilters = Boolean(debouncedSearch.trim()) || status !== 'all';
  const showEmptyCatalog = !isLoading && !error && data?.total === 0 && !hasActiveFilters;
  const showNoResults = !isLoading && !error && data?.total === 0 && hasActiveFilters;
  const isOrgError = error?.message.includes('Organization context is not configured');
  const isBusy = isDeleting || isCompleting;

  function clearFilters() {
    setSearch('');
    setDebouncedSearch('');
    setStatus('all');
    setPage(1);
  }

  async function handleDelete() {
    if (!deletingProduction || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deleteProductionAction(deletingProduction.id);

      if (!result.success) {
        toastFormError(result.error);
        return;
      }

      toast.success('Production draft deleted successfully');
      setDeletingProduction(null);

      if (data?.items.length === 1 && page > 1) {
        setPage((currentPage) => currentPage - 1);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['productions'] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleComplete() {
    if (!completingProduction || isCompleting) {
      return;
    }

    setIsCompleting(true);

    try {
      const result = await completeProductionAction(completingProduction.id);

      if (!result.success) {
        toastFormError(result.error);
        return;
      }

      toastWorkflowComplete(
        'Production completed. Raw materials deducted and product stock updated.',
        {
          nextStep: {
            label: 'Record Sale',
            onClick: () => router.push('/sales/new'),
          },
        },
      );
      setCompletingProduction(null);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['productions'] }),
        queryClient.invalidateQueries({ queryKey: ['production', completingProduction.id] }),
        queryClient.invalidateQueries({ queryKey: ['raw-materials'] }),
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
        title="Production"
        description="Record daily production and complete it to update inventory automatically."
      >
        {!showEmptyCatalog ? (
          <Button nativeButton={false} variant="success" size="xl" render={<Link href="/production/new" />}>
            <Plus />
            Record Production
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

      <ProductionFilters
        search={search}
        status={status}
        isSearching={isSearching}
        disabled={isLoading || isBusy}
        onSearchChange={setSearch}
        onStatusChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
      />

      {error && !isOrgError ? (
        <LoadErrorAlert
          title="Failed to load production entries"
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
          {getProductionListSummary(status, data.total)}
        </div>
      ) : null}

      {showEmptyCatalog ? (
        <EmptyState
          title="No production entries yet"
          description="Record your first production to plan what was baked today."
          actionLabel="Record Production"
          onAction={() => router.push('/production/new')}
        />
      ) : (
        <>
          {showNoResults ? (
            <EmptyState
              icon={SearchX}
              title="No matching records."
              description="Try clearing your filters to see all production entries."
              actionLabel="Clear Filters"
              onAction={clearFilters}
            />
          ) : (
            <ProductionTable
              productions={data?.items ?? []}
              isLoading={isLoading}
              isFetching={isFetching}
              disabled={isBusy}
              onDelete={(production) => setDeletingProduction(production)}
              onComplete={(production) => setCompletingProduction(production)}
            />
          )}

          {data && data.total > 0 ? (
            <DataTablePagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              pageSize={data.pageSize}
              entityName="production entries"
              disabled={isFetching || isBusy}
              onPageChange={setPage}
            />
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={Boolean(deletingProduction)}
        onOpenChange={(open) => {
          if (isDeleting) {
            return;
          }

          if (!open) {
            setDeletingProduction(null);
          }
        }}
        title="Delete production draft?"
        description={
          deletingProduction
            ? `This will soft-delete "${deletingProduction.productionNumber}". It will no longer appear in active lists but historical data is preserved.`
            : ''
        }
        confirmLabel="Delete"
        confirmVariant="destructive"
        loadingLabel="Deleting..."
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={Boolean(completingProduction)}
        onOpenChange={(open) => {
          if (isCompleting) {
            return;
          }

          if (!open) {
            setCompletingProduction(null);
          }
        }}
        title="Finish Production"
        description={
          completingProduction
            ? `Finish "${completingProduction.productionNumber}"? Ingredients will be taken from stock and ${completingProduction.totalUnits.toLocaleString('en-IN')} finished products will be added. This cannot be undone.`
            : ''
        }
        confirmLabel="Finish Production"
        confirmVariant="success"
        loadingLabel="Finishing..."
        isLoading={isCompleting}
        onConfirm={handleComplete}
      />
    </div>
  );
}
