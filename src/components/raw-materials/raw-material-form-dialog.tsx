'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  createRawMaterialAction,
  updateRawMaterialAction,
} from '@/actions/raw-materials';
import { RawMaterialForm } from '@/components/raw-materials/raw-material-form';
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
import type { RawMaterialFormValues } from '@/lib/domain/schemas/raw-material.schema';
import {
  mapRawMaterialActionError,
  type RawMaterialFieldError,
} from '@/lib/utils/raw-material-form-errors';
import { invalidateRawMaterialStockQueries } from '@/lib/utils/query-invalidation';
import { toastFormError } from '@/lib/utils/toast-form-error';
import { toastWithAction } from '@/lib/utils/workflow-toasts';
import type { RawMaterial } from '@/types/raw-material';

type RawMaterialFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rawMaterial?: RawMaterial;
  isEditMode?: boolean;
  isLoadingRawMaterial?: boolean;
};

export function RawMaterialFormDialog({
  open,
  onOpenChange,
  rawMaterial,
  isEditMode = false,
  isLoadingRawMaterial = false,
}: RawMaterialFormDialogProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<RawMaterialFieldError | null>(null);
  const isSubmittingRef = useRef(false);
  const formId = isEditMode ? 'edit-raw-material-form' : 'create-raw-material-form';
  const showForm = !isEditMode || Boolean(rawMaterial);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isSubmitting) {
      return;
    }

    if (!nextOpen) {
      setServerFieldError(null);
    }

    onOpenChange(nextOpen);
  }

  async function handleSubmit(values: RawMaterialFormValues) {
    if (isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setServerFieldError(null);

    try {
      const result = isEditMode
        ? await updateRawMaterialAction(rawMaterial!.id, {
            code: values.code,
            name: values.name,
            category: values.category,
            unit: values.unit,
            reorderLevel: values.reorderLevel ?? null,
            description: values.description ?? null,
            isActive: values.isActive,
          })
        : await createRawMaterialAction({
            code: values.code,
            name: values.name,
            category: values.category,
            unit: values.unit,
            reorderLevel: values.reorderLevel ?? null,
            description: values.description ?? null,
            isActive: values.isActive,
          });

      if (!result.success) {
        const fieldError = mapRawMaterialActionError(result.code);

        if (fieldError) {
          setServerFieldError(fieldError);
          return;
        }

        toastFormError(result.error);
        return;
      }

      if (isEditMode) {
        toast.success('Raw material updated successfully');
      } else {
        toastWithAction('Raw material created successfully', {
          label: 'Record Purchase',
          onClick: () => router.push('/purchases/new'),
        });
      }
      await invalidateRawMaterialStockQueries(queryClient);

      if (isEditMode) {
        await queryClient.invalidateQueries({ queryKey: ['raw-material', rawMaterial!.id] });
      }

      handleOpenChange(false);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="space-y-1.5 px-4 pt-4 sm:px-6">
          <DialogTitle>{isEditMode ? 'Edit Raw Material' : 'Add Raw Material'}</DialogTitle>
          <DialogDescription className="break-words">
            {isEditMode
              ? 'Update material details below. Current Stock and Average Cost are updated automatically when you record Purchases and Production.'
              : 'Add an ingredient or supply to your catalog. Stock levels and costs will update once you start recording purchases.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {isLoadingRawMaterial ? (
            <div className="space-y-4" aria-busy="true" aria-label="Loading raw material">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : showForm ? (
            <RawMaterialForm
              rawMaterial={rawMaterial}
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
            disabled={isSubmitting || isLoadingRawMaterial || !showForm}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Saving...
              </>
            ) : isEditMode ? (
              'Save Changes'
            ) : (
              'Create Raw Material'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
