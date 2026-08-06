'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { deleteProductAction, getProductAction } from '@/actions/products';
import { ProductDetailSummary } from '@/components/products/product-detail-summary';
import { ProductFormDialog } from '@/components/products/product-form-dialog';
import { useAuth } from '@/hooks/use-auth';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { PageHeader } from '@/components/shared/page-header';
import { TruncatedText } from '@/components/shared/truncated-text';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import { toastFormError } from '@/lib/utils/toast-form-error';

type ProductDetailPageProps = {
  productId: string;
};

function formatDateTime(date: Date): string {
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ProductDetailPage({ productId }: ProductDetailPageProps) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: product, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const result = await getProductAction(productId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: isAuthenticated,
  });

  async function handleDelete() {
    if (isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deleteProductAction(productId);

      if (!result.success) {
        toastFormError(result.error);
        return;
      }

      toast.success('Product deleted successfully');
      setIsDeleteOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      router.push('/products');
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading product">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="space-y-4">
        <LoadErrorAlert
          title="Unable to load product"
          error={error}
          onRetry={() => void refetch()}
          isRetrying={isRefetching}
        />
        {!error ? (
          <Alert variant="destructive">
            <AlertTitle>Product not found</AlertTitle>
            <AlertDescription>The requested product could not be loaded.</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  return (
    <TooltipProvider delay={300}>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/products" />}>
            <ArrowLeft />
            Back to Products
          </Button>
        </div>

        <PageHeader
          title={
            <TruncatedText
              text={product.name}
              maxWidthClassName="max-w-[min(100%,480px)]"
              className="text-left font-heading text-2xl font-semibold tracking-tight"
            />
          }
        >
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" className="text-primary" onClick={() => setIsEditOpen(true)}>
              <Pencil />
              Edit
            </Button>
            <Button variant="ghost" onClick={() => setIsDeleteOpen(true)} disabled={isDeleting}>
              <Trash2 />
              Delete
            </Button>
          </div>
        </PageHeader>

        <ProductDetailSummary
          sellingPrice={product.sellingPrice}
          currentStock={product.currentStock}
          unit={product.unit}
          hasRecipe={Boolean(product.activeRecipeId)}
          activeRecipeId={product.activeRecipeId}
          isActive={product.isActive}
        />

        <Card>
          <CardHeader>
            <CardTitle>Product Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <DetailField
              label="Product Code"
              value={
                <TruncatedText
                  text={product.code}
                  maxWidthClassName="max-w-full"
                  className="font-mono"
                />
              }
            />
            <DetailField label="Category" value={product.category} />
            <DetailField
              label="Description"
              value={
                <span className="break-words whitespace-pre-wrap">
                  {product.description ?? '—'}
                </span>
              }
              className="sm:col-span-2"
            />
          </CardContent>
        </Card>

        <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          <p>
            Created {formatDateTime(product.createdAt)} · Updated {formatDateTime(product.updatedAt)}
          </p>
        </div>

        <ProductFormDialog
          open={isEditOpen}
          onOpenChange={(open) => {
            setIsEditOpen(open);

            if (!open) {
              void refetch();
            }
          }}
          isEditMode
          product={product}
        />

        <ConfirmDialog
          open={isDeleteOpen}
          onOpenChange={(open) => {
            if (isDeleting) {
              return;
            }

            setIsDeleteOpen(open);
          }}
          title="Delete product?"
          description={`This will soft-delete "${product.name}". It will no longer appear in active lists but historical data is preserved.`}
          confirmLabel="Delete"
          confirmVariant="destructive"
          loadingLabel="Deleting..."
          isLoading={isDeleting}
          onConfirm={handleDelete}
        />
      </div>
    </TooltipProvider>
  );
}

function DetailField({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}
