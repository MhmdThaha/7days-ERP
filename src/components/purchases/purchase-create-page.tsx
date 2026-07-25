'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';

import { createPurchaseAction, receivePurchaseAction } from '@/actions/purchases';
import { PurchaseForm } from '@/components/purchases/purchase-form';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PurchaseFormValues } from '@/lib/domain/schemas/purchase.schema';
import {
  mapPurchaseActionError,
  type PurchaseFieldError,
} from '@/lib/utils/purchase-form-errors';
import { rememberSupplier } from '@/lib/utils/form-recent-values';
import { toastFormError } from '@/lib/utils/toast-form-error';
import { invalidateDashboardQueries } from '@/lib/utils/query-invalidation';
import { toastDraftSaved, toastWorkflowComplete } from '@/lib/utils/workflow-toasts';

const FORM_ID = 'purchase-create-form';

export function PurchaseCreatePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<PurchaseFieldError | null>(null);

  async function handleSubmit(values: PurchaseFormValues) {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setServerFieldError(null);

    try {
      const result = await createPurchaseAction({
        purchaseDate: values.purchaseDate,
        supplierName: values.supplierName,
        invoiceNumber: values.invoiceNumber || null,
        paymentStatus: values.paymentStatus,
        lineItems: values.lineItems,
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

      rememberSupplier(values.supplierName);

      const purchaseId = result.data.id;

      toastDraftSaved('Purchase saved as draft', 'Receive purchase', () => {
        void (async () => {
          const receiveResult = await receivePurchaseAction(purchaseId);

          if (!receiveResult.success) {
            toastFormError(receiveResult.error);
            return;
          }

          toastWorkflowComplete('Purchase received. Raw material stock has been updated.', {
            nextStep: {
              label: 'Record Production',
              onClick: () => router.push('/production/new'),
            },
          });

          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['purchases'] }),
            queryClient.invalidateQueries({ queryKey: ['purchase', purchaseId] }),
            queryClient.invalidateQueries({ queryKey: ['raw-materials'] }),
            invalidateDashboardQueries(queryClient),
          ]);
        })();
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['purchases'] }),
        invalidateDashboardQueries(queryClient),
      ]);

      router.push(`/purchases/${purchaseId}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/purchases" />}>
          <ArrowLeft />
          Back to Purchases
        </Button>
      </div>

      <PageHeader
        title="Record Purchase"
        description="Enter supplier details and line items. This saves a draft purchase only — inventory is not updated yet."
      />

      <Card>
        <CardHeader>
          <CardTitle>Purchase Details</CardTitle>
        </CardHeader>
        <CardContent>
          <PurchaseForm
            formId={FORM_ID}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            serverFieldError={serverFieldError}
            onServerFieldErrorHandled={() => setServerFieldError(null)}
          />
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button nativeButton={false} variant="outline" render={<Link href="/purchases" />} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" form={FORM_ID} disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Draft'}
        </Button>
      </div>
    </div>
  );
}
