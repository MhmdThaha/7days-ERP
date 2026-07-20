'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, SearchX } from 'lucide-react';
import { toast } from 'sonner';

import { deleteProductionAction } from '@/actions/production';
import { ProductionFilters } from '@/components/production/production-filters';
import { ProductionTable } from '@/components/production/production-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PRODUCTION_PAGE_SIZE } from '@/lib/domain/constants/production';
import { useProductions } from '@/hooks/queries/use-productions';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries } from '@/lib/utils/query-invalidation';
import { parseStatusFilter } from '@/lib/utils/list-url-filters';
import type { ProductionListItem, ProductionStatusFilter } from '@/types/production';

export function ProductionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<ProductionStatusFilter>(() =>
    parseStatusFilter(searchParams.get('status'), ['all', 'draft', 'completed'], 'all'),
  );
  const [page, setPage] = useState(1);
  const [deletingProduction, setDeletingProduction] = useState<ProductionListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [status]);

  const { data, isLoading, isFetching, error } = useProductions({
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
        toast.error(result.error);
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production"
        description="Record daily production and complete it to update inventory automatically."
      >
        <Button nativeButton={false} render={<Link href="/production/new" />}>
          <Plus />
          Record Production
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

      <ProductionFilters
        search={search}
        status={status}
        isSearching={isSearching}
        disabled={isLoading || isDeleting}
        onSearchChange={setSearch}
        onStatusChange={setStatus}
      />

      {error && !isOrgError ? (
        <Alert variant="destructive">
          <AlertTitle>Failed to load production entries</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
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
              disabled={isDeleting}
              onDelete={(production) => setDeletingProduction(production)}
            />
          )}

          {data && data.total > 0 ? (
            <DataTablePagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              pageSize={data.pageSize}
              entityName="production entries"
              disabled={isFetching || isDeleting}
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
    </div>
  );
}
