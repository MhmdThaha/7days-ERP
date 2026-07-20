'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, SearchX } from 'lucide-react';
import { toast } from 'sonner';

import { deleteWastageAction } from '@/actions/wastage';
import { WastageFilters } from '@/components/wastage/wastage-filters';
import { WastageTable } from '@/components/wastage/wastage-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { WASTAGE_PAGE_SIZE } from '@/lib/domain/constants/wastage';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries } from '@/lib/utils/query-invalidation';
import { useWastage } from '@/hooks/queries/use-wastage';
import type { WastageListItem } from '@/types/wastage';

export function WastagePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deletingWastage, setDeletingWastage] = useState<WastageListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isFetching, error } = useWastage({
    search: debouncedSearch,
    page,
    pageSize: WASTAGE_PAGE_SIZE,
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
    if (!deletingWastage || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deleteWastageAction(deletingWastage.id);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success('Wastage draft deleted successfully');
      setDeletingWastage(null);

      if (data?.items.length === 1 && page > 1) {
        setPage((currentPage) => currentPage - 1);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wastage'] }),
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
        title="Wastage"
        description="Record product wastage drafts for damaged, burnt, expired, or other losses. Inventory is updated when completing wastage in a later phase."
      >
        <Button nativeButton={false} render={<Link href="/wastage/new" />}>
          <Plus />
          Record Wastage
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

      <WastageFilters
        search={search}
        isSearching={isSearching}
        disabled={isLoading || isDeleting}
        onSearchChange={setSearch}
      />

      {error && !isOrgError ? (
        <Alert variant="destructive">
          <AlertTitle>Failed to load wastage entries</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}

      {showEmptyCatalog ? (
        <EmptyState
          title="No wastage drafts yet"
          description="Record your first wastage entry to track product losses."
          actionLabel="Record Wastage"
          onAction={() => router.push('/wastage/new')}
        />
      ) : (
        <>
          {showNoResults ? (
            <EmptyState
              icon={SearchX}
              title="No matching records."
              description="Try clearing your filters to see all wastage entries."
              actionLabel="Clear Filters"
              onAction={clearFilters}
            />
          ) : (
            <WastageTable
              wastageEntries={data?.items ?? []}
              isLoading={isLoading}
              isFetching={isFetching}
              disabled={isDeleting}
              onDelete={(wastage) => setDeletingWastage(wastage)}
            />
          )}

          {data && data.total > 0 ? (
            <DataTablePagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              pageSize={data.pageSize}
              entityName="wastage entries"
              disabled={isFetching || isDeleting}
              onPageChange={setPage}
            />
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={Boolean(deletingWastage)}
        onOpenChange={(open) => {
          if (isDeleting) {
            return;
          }

          if (!open) {
            setDeletingWastage(null);
          }
        }}
        title="Delete wastage draft?"
        description={
          deletingWastage
            ? `This will soft-delete "${deletingWastage.wastageNumber}". It will no longer appear in active lists but historical data is preserved.`
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
