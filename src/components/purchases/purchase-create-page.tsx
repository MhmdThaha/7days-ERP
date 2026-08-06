'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { createPurchaseAction, receivePurchaseAction } from '@/actions/purchases';
import { PurchaseForm } from '@/components/purchases/purchase-form';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EntrySuccessBanner } from '@/components/shared/entry-success-banner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import type { PurchaseFormValues } from '@/lib/domain/schemas/purchase.schema';
import {
  mapPurchaseActionError,
  type PurchaseFieldError,
} from '@/lib/utils/purchase-form-errors';
import { rememberSupplier } from '@/lib/utils/form-recent-values';
import { toastFormError } from '@/lib/utils/toast-form-error';
import { invalidateDashboardQueries } from '@/lib/utils/query-invalidation';

const FORM_ID = 'purchase-create-form';

type SuccessState = {
  purchaseNumber: string;
};

export function PurchaseCreatePage() {
  const queryClient = useQueryClient();
  const submitIntentRef = useRef<'draft' | 'complete'>('draft');
  const pendingDraftIdRef = useRef<string | null>(null);
  const [submitMode, setSubmitMode] = useState<'draft' | 'complete' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<PurchaseFieldError | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<PurchaseFormValues | null>(null);
  const [successState, setSuccessState] = useState<SuccessState | null>(null);
  const [formKey, setFormKey] = useState(0);

  async function saveDraft(values: PurchaseFormValues) {
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
      return null;
    }

    rememberSupplier(values.supplierName);

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['purchases'] }),
      invalidateDashboardQueries(queryClient),
    ]);

    return result.data;
  }

  async function handleSubmit(values: PurchaseFormValues) {
    if (isSubmitting) {
      return;
    }

    if (submitIntentRef.current === 'complete') {
      pendingDraftIdRef.current = null;
      setPendingValues(values);
      setConfirmOpen(true);
      submitIntentRef.current = 'draft';
      return;
    }

    setIsSubmitting(true);
    setServerFieldError(null);
    setSuccessState(null);
    setSubmitMode('draft');

    try {
      const purchase = await saveDraft(values);

      if (!purchase) {
        return;
      }

      toast.success('Purchase saved as draft');
    } finally {
      setIsSubmitting(false);
      setSubmitMode(null);
    }
  }

  async function handleConfirmReceive() {
    if (!pendingValues || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setServerFieldError(null);
    setSubmitMode('complete');

    try {
      let purchaseId = pendingDraftIdRef.current;

      if (!purchaseId) {
        const purchase = await saveDraft(pendingValues);

        if (!purchase) {
          return;
        }

        purchaseId = purchase.id;
        pendingDraftIdRef.current = purchaseId;
      }

      const receiveResult = await receivePurchaseAction(purchaseId);

      if (!receiveResult.success) {
        toastFormError(receiveResult.error);
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['purchases'] }),
        queryClient.invalidateQueries({ queryKey: ['purchase', purchaseId] }),
        queryClient.invalidateQueries({ queryKey: ['raw-materials'] }),
        invalidateDashboardQueries(queryClient),
      ]);

      pendingDraftIdRef.current = null;
      setSuccessState({ purchaseNumber: receiveResult.data.purchaseNumber });
      setPendingValues(null);
      setConfirmOpen(false);
      setFormKey((current) => current + 1);
    } finally {
      setIsSubmitting(false);
      setSubmitMode(null);
    }
  }

  function handleNewPurchase() {
    setSuccessState(null);
    setFormKey((current) => current + 1);
  }

  function handleSaveDraftClick() {
    submitIntentRef.current = 'draft';
  }

  function handleSaveAndReceiveClick() {
    submitIntentRef.current = 'complete';
  }

  const lineCount = pendingValues?.lineItems.length ?? 0;

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
        description="Add supplier and materials, then receive to update stock."
      />

      {successState ? (
        <EntrySuccessBanner
          title="Purchase received"
          description={`${successState.purchaseNumber} received. Raw material stock has been updated.`}
          actionLabel="Record another purchase"
          onAction={handleNewPurchase}
        />
      ) : null}

      <PurchaseForm
        key={formKey}
        formId={FORM_ID}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        serverFieldError={serverFieldError}
        onServerFieldErrorHandled={() => setServerFieldError(null)}
        footerActions={
          <>
            <Button
              nativeButton={false}
              variant="ghost"
              render={<Link href="/purchases" />}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form={FORM_ID}
              variant="outline"
              disabled={isSubmitting}
              onClick={handleSaveDraftClick}
            >
              {isSubmitting && submitMode === 'draft' ? 'Saving...' : 'Save Draft'}
            </Button>
            <Button
              type="submit"
              form={FORM_ID}
              variant="success"
              size="xl"
              disabled={isSubmitting}
              onClick={handleSaveAndReceiveClick}
            >
              {isSubmitting && submitMode === 'complete' ? 'Receiving...' : 'Save & Receive'}
            </Button>
          </>
        }
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (isSubmitting) {
            return;
          }

          if (!open) {
            setConfirmOpen(false);
            setPendingValues(null);
            pendingDraftIdRef.current = null;
          }
        }}
        title="Receive Purchase"
        description={
          pendingValues
            ? `Receive this purchase from ${pendingValues.supplierName}? Raw material stock will increase for ${lineCount} line${lineCount === 1 ? '' : 's'}. This cannot be undone.`
            : ''
        }
        confirmLabel="Save & Receive"
        loadingLabel="Receiving..."
        isLoading={isSubmitting}
        onConfirm={() => void handleConfirmReceive()}
      />
    </div>
  );
}
