'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { deleteProductAction, getProductAction } from '@/actions/products';
import { ProductFormDialog } from '@/components/products/product-form-dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { MoneyDisplay } from '@/components/shared/money-display';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { TruncatedText } from '@/components/shared/truncated-text';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';

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
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: product, isLoading, error, refetch } = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const result = await getProductAction(productId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
  });

  async function handleDelete() {
    if (isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deleteProductAction(productId);

      if (!result.success) {
        toast.error(result.error);
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
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Product not found</AlertTitle>
        <AlertDescription>
          {error?.message ?? 'The requested product could not be loaded.'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <TooltipProvider delay={300}>
      <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" render={<Link href="/products" />}>
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
          <Button variant="outline" onClick={() => setIsEditOpen(true)}>
            <Pencil />
            Edit
          </Button>
          <Button variant="destructive" onClick={() => setIsDeleteOpen(true)} disabled={isDeleting}>
            <Trash2 />
            Delete
          </Button>
        </div>
      </PageHeader>

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
            label="Selling Price"
            value={<MoneyDisplay amount={product.sellingPrice} />}
          />
          <DetailField
            label="Current Stock"
            value={
              <span className="font-medium tabular-nums">
                {product.currentStock.toLocaleString('en-IN', { maximumFractionDigits: 3 })}{' '}
                {product.unit}
              </span>
            }
          />
          <DetailField label="Status" value={<StatusBadge isActive={product.isActive} />} />
          <DetailField
            label="Description"
            value={
              <span className="break-words whitespace-pre-wrap">
                {product.description ?? '—'}
              </span>
            }
            className="sm:col-span-2"
          />
          <DetailField label="Created At" value={formatDateTime(product.createdAt)} />
          <DetailField label="Updated At" value={formatDateTime(product.updatedAt)} />
        </CardContent>
      </Card>

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
