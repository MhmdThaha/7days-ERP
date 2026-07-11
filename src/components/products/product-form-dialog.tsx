'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { createProductAction, updateProductAction } from '@/actions/products';
import { ProductForm } from '@/components/products/product-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProductFormValues } from '@/lib/domain/schemas/product.schema';
import {
  mapProductActionError,
  type ProductFieldError,
} from '@/lib/utils/product-form-errors';
import type { Product } from '@/types/product';

type ProductFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product;
  isEditMode?: boolean;
  isLoadingProduct?: boolean;
};

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  isEditMode = false,
  isLoadingProduct = false,
}: ProductFormDialogProps) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<ProductFieldError | null>(null);
  const isSubmittingRef = useRef(false);
  const formId = isEditMode ? 'edit-product-form' : 'create-product-form';
  const showForm = !isEditMode || Boolean(product);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isSubmitting) {
      return;
    }

    if (!nextOpen) {
      setServerFieldError(null);
    }

    onOpenChange(nextOpen);
  }

  async function handleSubmit(values: ProductFormValues) {
    if (isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setServerFieldError(null);

    try {
      const result = isEditMode
        ? await updateProductAction(product!.id, {
            code: values.code,
            name: values.name,
            category: values.category,
            sellingPrice: values.sellingPrice,
            description: values.description ?? null,
            isActive: values.isActive,
          })
        : await createProductAction({
            code: values.code,
            name: values.name,
            category: values.category,
            sellingPrice: values.sellingPrice,
            description: values.description ?? null,
            isActive: values.isActive,
          });

      if (!result.success) {
        const fieldError = mapProductActionError(result.code);

        if (fieldError) {
          setServerFieldError(fieldError);
          return;
        }

        toast.error(result.error);
        return;
      }

      toast.success(isEditMode ? 'Product updated successfully' : 'Product created successfully');
      await queryClient.invalidateQueries({ queryKey: ['products'] });

      if (isEditMode) {
        await queryClient.invalidateQueries({ queryKey: ['product', product!.id] });
      }

      handleOpenChange(false);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="space-y-1.5 px-4 pt-4 sm:px-6">
          <DialogTitle>{isEditMode ? 'Edit Product' : 'Add Product'}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update product details. Changes apply to future transactions only.'
              : 'Create a new product for your bakery catalog.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {isLoadingProduct ? (
            <div className="space-y-4" aria-busy="true" aria-label="Loading product">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : showForm ? (
            <ProductForm
              product={product}
              open={open}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              formId={formId}
              autoFocus={open && showForm}
              serverFieldError={serverFieldError}
              onServerFieldErrorHandled={() => setServerFieldError(null)}
            />
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={isSubmitting || isLoadingProduct || !showForm}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Saving...
              </>
            ) : isEditMode ? (
              'Save Changes'
            ) : (
              'Create Product'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
