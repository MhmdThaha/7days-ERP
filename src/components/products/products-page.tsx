'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, SearchX } from 'lucide-react';
import { toast } from 'sonner';

import {
  deleteProductAction,
  getProductAction,
} from '@/actions/products';
import { ProductFilters } from '@/components/products/product-filters';
import { ProductFormDialog } from '@/components/products/product-form-dialog';
import { ProductTable } from '@/components/products/product-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PRODUCT_PAGE_SIZE } from '@/lib/domain/constants/product';
import { useProducts } from '@/hooks/queries/use-products';
import type { ProductListItem, ProductStatusFilter } from '@/types/product';

export function ProductsPage() {
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

  const { data, isLoading, isFetching, error } = useProducts({
    search: debouncedSearch,
    status,
    page,
    pageSize: PRODUCT_PAGE_SIZE,
  });

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
    enabled: Boolean(editingProductId),
  });

  const isSearching = search !== debouncedSearch;
  const hasActiveFilters = Boolean(debouncedSearch.trim()) || status !== 'active';
  const showEmptyCatalog = !isLoading && !error && data?.total === 0 && !hasActiveFilters;
  const showNoResults = !isLoading && !error && data?.total === 0 && hasActiveFilters;
  const isOrgError = error?.message.includes('Organization context is not configured');

  async function handleDelete() {
    if (!deletingProduct || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deleteProductAction(deletingProduct.id);

      if (!result.success) {
        toast.error(result.error);
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
      <PageHeader title="Products">
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus />
          Add Product
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
        <Alert variant="destructive">
          <AlertTitle>Failed to load products</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}

      {showEmptyCatalog ? (
        <EmptyState
          title="No products yet"
          description="Add your first product to start building your bakery catalog."
          actionLabel="Add Product"
          onAction={() => setIsCreateOpen(true)}
        />
      ) : (
        <>
          {showNoResults ? (
            <EmptyState
              icon={SearchX}
              title="No products found"
              description="Try adjusting your search or filter to find what you are looking for."
            />
          ) : (
            <ProductTable
              products={data?.items ?? []}
              isLoading={isLoading}
              isFetching={isFetching}
              disabled={isDeleting}
              onEdit={(productId) => setEditingProductId(productId)}
              onDelete={(product) => setDeletingProduct(product)}
            />
          )}

          {data && data.total > 0 ? (
            <DataTablePagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              pageSize={data.pageSize}
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
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
