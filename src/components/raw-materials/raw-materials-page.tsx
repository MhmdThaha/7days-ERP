'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, SearchX, Wheat } from 'lucide-react';
import { toast } from 'sonner';

import {
  deleteRawMaterialAction,
  getRawMaterialAction,
} from '@/actions/raw-materials';
import { RawMaterialFilters } from '@/components/raw-materials/raw-material-filters';
import { RawMaterialFormDialog } from '@/components/raw-materials/raw-material-form-dialog';
import { RawMaterialInventoryNotice } from '@/components/raw-materials/raw-material-inventory-notice';
import { RawMaterialTable } from '@/components/raw-materials/raw-material-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RAW_MATERIAL_PAGE_SIZE } from '@/lib/domain/constants/raw-material';
import { useRawMaterials } from '@/hooks/queries/use-raw-materials';
import type { RawMaterialListItem, RawMaterialStatusFilter } from '@/types/raw-material';

export function RawMaterialsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<RawMaterialStatusFilter>('active');
  const [category, setCategory] = useState('all');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRawMaterialId, setEditingRawMaterialId] = useState<string | null>(null);
  const [deletingRawMaterial, setDeletingRawMaterial] = useState<RawMaterialListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showInventoryNotice, setShowInventoryNotice] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isFetching, error, refetch, isError } = useRawMaterials({
    search: debouncedSearch,
    status,
    category: category === 'all' ? undefined : category,
    lowStockOnly,
    page,
    pageSize: RAW_MATERIAL_PAGE_SIZE,
  });

  const { data: editingRawMaterialResult, isLoading: isLoadingEditingRawMaterial } = useQuery({
    queryKey: ['raw-material', editingRawMaterialId],
    queryFn: async () => {
      const result = await getRawMaterialAction(editingRawMaterialId!);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: Boolean(editingRawMaterialId),
  });

  const isSearching = search !== debouncedSearch;
  const hasActiveFilters =
    Boolean(debouncedSearch.trim()) ||
    status !== 'active' ||
    category !== 'all' ||
    lowStockOnly;
  const showEmptyCatalog = !isLoading && !isError && data?.total === 0 && !hasActiveFilters;
  const showNoResults = !isLoading && !isError && data?.total === 0 && hasActiveFilters;
  const isOrgError = error?.message.includes('Organization context is not configured');

  function clearFilters() {
    setSearch('');
    setDebouncedSearch('');
    setStatus('active');
    setCategory('all');
    setLowStockOnly(false);
    setPage(1);
  }

  async function handleDelete() {
    if (!deletingRawMaterial || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deleteRawMaterialAction(deletingRawMaterial.id);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success('Raw material deleted successfully');
      setDeletingRawMaterial(null);

      if (data?.items.length === 1 && page > 1) {
        setPage((currentPage) => currentPage - 1);
      }

      await queryClient.invalidateQueries({ queryKey: ['raw-materials'] });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Raw Materials"
        description="Manage ingredients and supplies used in recipes. Stock and costs update automatically from Purchases and Production."
      >
        <Button onClick={() => setIsCreateOpen(true)} className="shrink-0">
          <Plus />
          Add Raw Material
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

      {showInventoryNotice && !isOrgError ? (
        <RawMaterialInventoryNotice onDismiss={() => setShowInventoryNotice(false)} />
      ) : null}

      <RawMaterialFilters
        search={search}
        status={status}
        category={category}
        lowStockOnly={lowStockOnly}
        isSearching={isSearching}
        disabled={isLoading || isDeleting}
        onSearchChange={setSearch}
        onStatusChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
        onCategoryChange={(value) => {
          setCategory(value);
          setPage(1);
        }}
        onLowStockOnlyChange={(value) => {
          setLowStockOnly(value);
          setPage(1);
        }}
      />

      {error && !isOrgError ? (
        <Alert variant="destructive">
          <AlertTitle>Failed to load raw materials</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{error.message}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 border-destructive/30 bg-background"
              onClick={() => void refetch()}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {showEmptyCatalog ? (
        <EmptyState
          icon={Wheat}
          title="No raw materials yet"
          description="Add flour, dairy, packaging, and other ingredients here. Once you record purchases, stock and average cost will appear automatically."
          actionLabel="Add Raw Material"
          onAction={() => setIsCreateOpen(true)}
        />
      ) : (
        <>
          {showNoResults ? (
            <EmptyState
              icon={SearchX}
              title="No matching records."
              description="Try clearing your filters to see all raw materials."
              actionLabel="Clear Filters"
              onAction={clearFilters}
            />
          ) : (
            <RawMaterialTable
              rawMaterials={data?.items ?? []}
              isLoading={isLoading}
              isFetching={isFetching}
              disabled={isDeleting}
              onEdit={(rawMaterialId) => setEditingRawMaterialId(rawMaterialId)}
              onDelete={(rawMaterial) => setDeletingRawMaterial(rawMaterial)}
            />
          )}

          {data && data.total > 0 ? (
            <DataTablePagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              pageSize={data.pageSize}
              entityName="raw materials"
              disabled={isFetching || isDeleting}
              onPageChange={setPage}
            />
          ) : null}
        </>
      )}

      <RawMaterialFormDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      <RawMaterialFormDialog
        open={Boolean(editingRawMaterialId)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingRawMaterialId(null);
          }
        }}
        isEditMode
        isLoadingRawMaterial={isLoadingEditingRawMaterial}
        rawMaterial={editingRawMaterialResult}
      />

      <ConfirmDialog
        open={Boolean(deletingRawMaterial)}
        onOpenChange={(open) => {
          if (isDeleting) {
            return;
          }

          if (!open) {
            setDeletingRawMaterial(null);
          }
        }}
        title="Delete raw material?"
        description={
          deletingRawMaterial
            ? `This will soft-delete "${deletingRawMaterial.name}". It will no longer appear in active lists but historical data is preserved.`
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
