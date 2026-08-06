'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, SearchX, Upload } from 'lucide-react';
import { toast } from 'sonner';

import {
  deleteProductAction,
  getProductAction,
} from '@/actions/products';
import { ProductCatalogHealth } from '@/components/products/product-catalog-health';
import { ProductFilters } from '@/components/products/product-filters';
import { useAuth } from '@/hooks/use-auth';
import { ProductFormDialog } from '@/components/products/product-form-dialog';
import { ProductTable } from '@/components/products/product-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PRODUCT_PAGE_SIZE } from '@/lib/domain/constants/product';
import { useProducts } from '@/hooks/queries/use-products';
import { toastFormError } from '@/lib/utils/toast-form-error';
import type { ProductListItem, ProductStatusFilter } from '@/types/product';

function getProductListSummary(status: ProductStatusFilter, total: number): string {
  if (status === 'active') {
    return total === 1 ? '1 active product' : `${total.toLocaleString('en-IN')} active products`;
  }

  if (status === 'inactive') {
    return total === 1 ? '1 inactive product' : `${total.toLocaleString('en-IN')} inactive products`;
  }

  return total === 1 ? '1 product' : `${total.toLocaleString('en-IN')} products`;
}

export function ProductsPage() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<ProductStatusFilter>('active');
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<ProductListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isFetching, error, refetch, isRefetching } = useProducts({
    search: debouncedSearch,
    status,
    page,
    pageSize: PRODUCT_PAGE_SIZE,
  });

  const { data: catalogMeta, isLoading: isCatalogMetaLoading } = useProducts({
    search: '',
    status: 'all',
    page: 1,
    pageSize: 1,
  });

  const catalogFetchSize = Math.max(catalogMeta?.total ?? 0, 1);

  const { data: catalogData, isLoading: isCatalogLoading } = useProducts({
    search: '',
    status: 'all',
    page: 1,
    pageSize: catalogFetchSize,
  });

  const catalogHealth = useMemo(() => {
    const items = catalogData?.items ?? [];

    return {
      activeCount: items.filter((product) => product.isActive).length,
      inactiveCount: items.filter((product) => !product.isActive).length,
      missingRecipeCount: items.filter((product) => product.isActive && !product.activeRecipeId).length,
    };
  }, [catalogData]);

  const {
    data: editingProductResult,
    isLoading: isLoadingEditingProduct,
  } = useQuery({
    queryKey: ['product', editingProductId],
    queryFn: async () => {
      const result = await getProductAction(editingProductId!);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: isAuthenticated && Boolean(editingProductId),
  });

  const isSearching = search !== debouncedSearch;
  const hasActiveFilters = Boolean(debouncedSearch.trim()) || status !== 'active';
  const showEmptyCatalog = !isLoading && !error && data?.total === 0 && !hasActiveFilters;
  const showNoResults = !isLoading && !error && data?.total === 0 && hasActiveFilters;
  const isOrgError = error?.message.includes('Organization context is not configured');
  const showCatalogHealth = !showEmptyCatalog && !isOrgError;

  function clearFilters() {
    setSearch('');
    setDebouncedSearch('');
    setStatus('active');
    setPage(1);
  }

  async function handleDelete() {
    if (!deletingProduct || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deleteProductAction(deletingProduct.id);

      if (!result.success) {
        toastFormError(result.error);
        return;
      }

      toast.success('Product deleted successfully');
      setDeletingProduct(null);

      if (data?.items.length === 1 && page > 1) {
        setPage((currentPage) => currentPage - 1);
      }

      await queryClient.invalidateQueries({ queryKey: ['products'] });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Manage finished products, prices, and recipe links."
      >
        <Button nativeButton={false} variant="outline" render={<Link href="/products/import" />}>
          <Upload />
          Import
        </Button>
        {!showEmptyCatalog ? (
          <Button variant="success" size="xl" onClick={() => setIsCreateOpen(true)}>
            <Plus />
            Add Product
          </Button>
        ) : null}
      </PageHeader>

      {showCatalogHealth ? (
        <ProductCatalogHealth
          activeCount={catalogHealth.activeCount}
          missingRecipeCount={catalogHealth.missingRecipeCount}
          inactiveCount={catalogHealth.inactiveCount}
          isLoading={isCatalogMetaLoading || isCatalogLoading}
        />
      ) : null}

      {isOrgError ? (
        <Alert variant="destructive">
          <AlertTitle>Configuration required</AlertTitle>
          <AlertDescription>
            Set <code className="font-mono text-sm">DEV_ORG_ID</code> in your{' '}
            <code className="font-mono text-sm">.env.local</code> file to connect to Firestore.
          </AlertDescription>
        </Alert>
      ) : null}

      <ProductFilters
        search={search}
        status={status}
        isSearching={isSearching}
        disabled={isLoading || isDeleting}
        onSearchChange={setSearch}
        onStatusChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
      />

      {error && !isOrgError ? (
        <LoadErrorAlert
          title="Failed to load products"
          error={error}
          onRetry={() => void refetch()}
          isRetrying={isRefetching}
        />
      ) : null}

      {showEmptyCatalog ? (
        <EmptyState
          title="No products yet"
          description="Add your first product to start building your bakery catalog."
          actionLabel="Add Product"
          onAction={() => setIsCreateOpen(true)}
        />
      ) : showNoResults ? (
        <EmptyState
          icon={SearchX}
          title="No matching records."
          description="Try clearing your filters to see all products."
          actionLabel="Clear Filters"
          onAction={clearFilters}
        />
      ) : (
        <>
          {data && data.total > 0 ? (
            <div
              className="rounded-lg border bg-muted/30 px-4 py-3 text-base font-medium text-muted-foreground"
              role="status"
            >
              {getProductListSummary(status, data.total)}
            </div>
          ) : null}

          <ProductTable
            products={data?.items ?? []}
            isLoading={isLoading}
            isFetching={isFetching}
            disabled={isDeleting}
            onEdit={(productId) => setEditingProductId(productId)}
            onDelete={(product) => setDeletingProduct(product)}
          />

          {data && data.total > 0 ? (
            <DataTablePagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              pageSize={data.pageSize}
              entityName="products"
              disabled={isFetching || isDeleting}
              onPageChange={setPage}
            />
          ) : null}
        </>
      )}

      <ProductFormDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      <ProductFormDialog
        open={Boolean(editingProductId)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingProductId(null);
          }
        }}
        isEditMode
        isLoadingProduct={isLoadingEditingProduct}
        product={editingProductResult}
      />

      <ConfirmDialog
        open={Boolean(deletingProduct)}
        onOpenChange={(open) => {
          if (isDeleting) {
            return;
          }

          if (!open) {
            setDeletingProduct(null);
          }
        }}
        title="Delete product?"
        description={
          deletingProduct
            ? `This will soft-delete "${deletingProduct.name}". It will no longer appear in active lists but historical data is preserved.`
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
