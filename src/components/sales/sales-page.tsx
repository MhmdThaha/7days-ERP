'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, SearchX } from 'lucide-react';
import { toast } from 'sonner';

import { deleteSaleAction } from '@/actions/sales';
import { SaleFilters } from '@/components/sales/sale-filters';
import { SaleTable } from '@/components/sales/sale-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SALE_PAGE_SIZE } from '@/lib/domain/constants/sale';
import { useSales } from '@/hooks/queries/use-sales';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries } from '@/lib/utils/query-invalidation';
import { parseStatusFilter } from '@/lib/utils/list-url-filters';
import type { SaleListItem, SaleStatusFilter } from '@/types/sale';

export function SalesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<SaleStatusFilter>(() =>
    parseStatusFilter(searchParams.get('status'), ['all', 'draft', 'completed'], 'all'),
  );
  const [page, setPage] = useState(1);
  const [deletingSale, setDeletingSale] = useState<SaleListItem | null>(null);
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

  const { data, isLoading, isFetching, error } = useSales({
    search: debouncedSearch,
    status,
    page,
    pageSize: SALE_PAGE_SIZE,
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
    if (!deletingSale || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deleteSaleAction(deletingSale.id);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success('Sale draft deleted successfully');
      setDeletingSale(null);

      if (data?.items.length === 1 && page > 1) {
        setPage((currentPage) => currentPage - 1);
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales"
        description="Record sales drafts for shop deliveries and customer orders. Inventory is updated when completing a sale in a later phase."
      >
        <Button nativeButton={false} render={<Link href="/sales/new" />}>
          <Plus />
          Record Sale
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

      <SaleFilters
        search={search}
        status={status}
        isSearching={isSearching}
        disabled={isLoading || isDeleting}
        onSearchChange={setSearch}
        onStatusChange={setStatus}
      />

      {error && !isOrgError ? (
        <Alert variant="destructive">
          <AlertTitle>Failed to load sales</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
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
              disabled={isDeleting}
              onDelete={(sale) => setDeletingSale(sale)}
            />
          )}

          {data && data.total > 0 ? (
            <DataTablePagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              pageSize={data.pageSize}
              entityName="sales"
              disabled={isFetching || isDeleting}
              onPageChange={setPage}
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
    </div>
  );
}
