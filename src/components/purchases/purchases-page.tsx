'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, SearchX } from 'lucide-react';
import { toast } from 'sonner';

import { deletePurchaseAction, receivePurchaseAction } from '@/actions/purchases';
import { PurchaseFilters } from '@/components/purchases/purchase-filters';
import { PurchaseTable } from '@/components/purchases/purchase-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PURCHASE_PAGE_SIZE } from '@/lib/domain/constants/purchase';
import { usePurchases } from '@/hooks/queries/use-purchases';
import { invalidateDashboardQueries } from '@/lib/utils/query-invalidation';
import { parseStatusFilter } from '@/lib/utils/list-url-filters';
import type { PurchaseListItem, PurchaseStatusFilter } from '@/types/purchase';

export function PurchasesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<PurchaseStatusFilter>(() =>
    parseStatusFilter(searchParams.get('status'), ['all', 'draft', 'received'], 'all'),
  );
  const [page, setPage] = useState(1);
  const [deletingPurchase, setDeletingPurchase] = useState<PurchaseListItem | null>(null);
  const [receivingPurchase, setReceivingPurchase] = useState<PurchaseListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);

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

  const { data, isLoading, isFetching, error } = usePurchases({
    search: debouncedSearch,
    status,
    page,
    pageSize: PURCHASE_PAGE_SIZE,
  });

  const isSearching = search !== debouncedSearch;
  const hasActiveFilters = Boolean(debouncedSearch.trim()) || status !== 'all';
  const showEmptyCatalog = !isLoading && !error && data?.total === 0 && !hasActiveFilters;
  const showNoResults = !isLoading && !error && data?.total === 0 && hasActiveFilters;
  const isOrgError = error?.message.includes('Organization context is not configured');
  const isBusy = isDeleting || isReceiving;

  function clearFilters() {
    setSearch('');
    setDebouncedSearch('');
    setStatus('all');
    setPage(1);
  }

  async function invalidateAfterMutation(purchaseId?: string) {
    const invalidations = [
      queryClient.invalidateQueries({ queryKey: ['purchases'] }),
      queryClient.invalidateQueries({ queryKey: ['raw-materials'] }),
      invalidateDashboardQueries(queryClient),
    ];

    if (purchaseId) {
      invalidations.push(queryClient.invalidateQueries({ queryKey: ['purchase', purchaseId] }));
    }

    await Promise.all(invalidations);
  }

  async function handleDelete() {
    if (!deletingPurchase || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deletePurchaseAction(deletingPurchase.id);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success('Purchase deleted successfully');
      setDeletingPurchase(null);

      if (data?.items.length === 1 && page > 1) {
        setPage((currentPage) => currentPage - 1);
      }

      await invalidateAfterMutation();
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleReceive() {
    if (!receivingPurchase || isReceiving) {
      return;
    }

    setIsReceiving(true);

    try {
      const result = await receivePurchaseAction(receivingPurchase.id);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success('Purchase received successfully. Raw material stock has been updated.');
      setReceivingPurchase(null);

      await invalidateAfterMutation(receivingPurchase.id);
    } finally {
      setIsReceiving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchases"
        description="Record raw material purchases and receive them into inventory when goods arrive."
      >
        <Button nativeButton={false} render={<Link href="/purchases/new" />}>
          <Plus />
          Record Purchase
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

      <PurchaseFilters
        search={search}
        status={status}
        isSearching={isSearching}
        disabled={isLoading || isBusy}
        onSearchChange={setSearch}
        onStatusChange={setStatus}
      />

      {error && !isOrgError ? (
        <Alert variant="destructive">
          <AlertTitle>Failed to load purchases</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}

      {showEmptyCatalog ? (
        <EmptyState
          title="No purchases yet"
          description="Record your first raw material purchase to start building purchase history."
          actionLabel="Record Purchase"
          onAction={() => router.push('/purchases/new')}
        />
      ) : (
        <>
          {showNoResults ? (
            <EmptyState
              icon={SearchX}
              title="No matching records."
              description="Try clearing your filters to see all purchases."
              actionLabel="Clear Filters"
              onAction={clearFilters}
            />
          ) : (
            <PurchaseTable
              purchases={data?.items ?? []}
              isLoading={isLoading}
              isFetching={isFetching}
              disabled={isBusy}
              onDelete={(purchase) => setDeletingPurchase(purchase)}
              onReceive={(purchase) => setReceivingPurchase(purchase)}
            />
          )}

          {data && data.total > 0 ? (
            <DataTablePagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              pageSize={data.pageSize}
              entityName="purchases"
              disabled={isFetching || isBusy}
              onPageChange={setPage}
            />
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={Boolean(deletingPurchase)}
        onOpenChange={(open) => {
          if (isDeleting) {
            return;
          }

          if (!open) {
            setDeletingPurchase(null);
          }
        }}
        title="Delete purchase?"
        description={
          deletingPurchase
            ? `This will soft-delete "${deletingPurchase.purchaseNumber}". It will no longer appear in active lists but historical data is preserved.`
            : ''
        }
        confirmLabel="Delete"
        confirmVariant="destructive"
        loadingLabel="Deleting..."
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={Boolean(receivingPurchase)}
        onOpenChange={(open) => {
          if (isReceiving) {
            return;
          }

          if (!open) {
            setReceivingPurchase(null);
          }
        }}
        title="Receive Purchase"
        description="Are you sure you want to receive this purchase?"
        confirmLabel="Receive Purchase"
        loadingLabel="Receiving..."
        isLoading={isReceiving}
        onConfirm={handleReceive}
      />
    </div>
  );
}
