'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { getPurchaseAction, updatePurchaseAction } from '@/actions/purchases';
import { useAuth } from '@/hooks/use-auth';
import { PurchaseForm } from '@/components/purchases/purchase-form';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { PurchaseFormValues } from '@/lib/domain/schemas/purchase.schema';
import { toastFormError } from '@/lib/utils/toast-form-error';
import {
  mapPurchaseActionError,
  type PurchaseFieldError,
} from '@/lib/utils/purchase-form-errors';
import { invalidateDashboardQueries } from '@/lib/utils/query-invalidation';

const FORM_ID = 'purchase-edit-form';

type PurchaseEditPageProps = {
  purchaseId: string;
};

export function PurchaseEditPage({ purchaseId }: PurchaseEditPageProps) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<PurchaseFieldError | null>(null);

  const {
    data: purchase,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['purchase', purchaseId],
    queryFn: async () => {
      const result = await getPurchaseAction(purchaseId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: isAuthenticated,
  });

  async function handleSubmit(values: PurchaseFormValues) {
    if (isSubmitting || !purchase) {
      return;
    }

    setIsSubmitting(true);
    setServerFieldError(null);

    try {
      const result = await updatePurchaseAction(purchaseId, {
        purchaseDate: values.purchaseDate,
        supplierName: values.supplierName,
        invoiceNumber: values.invoiceNumber || null,
        paymentStatus: values.paymentStatus,
        lineItems: values.lineItems,
        discountAmount: values.discountAmount,
        adjustmentAmount: values.adjustmentAmount,
        notes: values.notes ?? null,
      });

      if (!result.success) {
        const fieldError = mapPurchaseActionError(result.code);

        if (fieldError) {
          setServerFieldError(fieldError);
        }

        toastFormError(result.error);
        return;
      }

      toast.success('Purchase updated successfully');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['purchases'] }),
        queryClient.invalidateQueries({ queryKey: ['purchase', purchaseId] }),
        invalidateDashboardQueries(queryClient),
      ]);

      router.push(`/purchases/${purchaseId}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading purchase">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !purchase) {
    return (
      <div className="space-y-4">
        <LoadErrorAlert
          title="Unable to load purchase"
          error={error}
          onRetry={() => void refetch()}
          isRetrying={isRefetching}
        />
        {!error ? (
          <Alert variant="destructive">
            <AlertTitle>Purchase not found</AlertTitle>
            <AlertDescription>The requested purchase could not be loaded.</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  if (purchase.status !== 'draft') {
    return (
      <Alert variant="destructive">
        <AlertTitle>Cannot edit purchase</AlertTitle>
        <AlertDescription>Only draft purchases can be edited.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button
          nativeButton={false}
          variant="ghost"
          size="sm"
          render={<Link href={`/purchases/${purchaseId}`} />}
        >
          <ArrowLeft />
          Back to Purchase
        </Button>
      </div>

      <PageHeader
        title="Edit Purchase"
        description={`Update draft purchase ${purchase.purchaseNumber}.`}
      />

      <PurchaseForm
        formId={FORM_ID}
        purchase={purchase}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        serverFieldError={serverFieldError}
        onServerFieldErrorHandled={() => setServerFieldError(null)}
        footerActions={
          <>
            <Button
              nativeButton={false}
              variant="ghost"
              render={<Link href={`/purchases/${purchaseId}`} />}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" form={FORM_ID} variant="success" size="xl" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </>
        }
      />
    </div>
  );
}
