'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { createPurchaseAction, receivePurchaseAction } from '@/actions/purchases';
import { PurchaseForm } from '@/components/purchases/purchase-form';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import type { PurchaseFormValues } from '@/lib/domain/schemas/purchase.schema';
import {
  mapPurchaseActionError,
  type PurchaseFieldError,
} from '@/lib/utils/purchase-form-errors';
import { rememberSupplier } from '@/lib/utils/form-recent-values';
import { toastFormError } from '@/lib/utils/toast-form-error';
import { invalidateDailyReportQueries, invalidateDashboardQueries } from '@/lib/utils/query-invalidation';

const FORM_ID = 'purchase-create-form';

/** TEMPORARY Save & Receive timing — remove after measurement. Dev-only. */
function tempSaveReceivePerf(
  trialId: string,
  stage: string,
  data?: Record<string, number | string | boolean>,
): void {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  console.log('[TEMP-PERF][Save&Receive]', { trialId, stage, ...data });
}

export function PurchaseCreatePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const submitIntentRef = useRef<'draft' | 'complete'>('draft');
  const pendingDraftIdRef = useRef<string | null>(null);
  /** Synchronous lock — blocks a second confirm before isSubmitting re-renders. */
  const confirmReceiveInFlightRef = useRef(false);
  const [submitMode, setSubmitMode] = useState<'draft' | 'complete' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<PurchaseFieldError | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<PurchaseFormValues | null>(null);

  async function saveDraft(values: PurchaseFormValues, trialId?: string) {
    const createStartedAt = performance.now();
    if (trialId) {
      tempSaveReceivePerf(trialId, 'createPurchaseAction start');
    }

    const result = await createPurchaseAction({
      purchaseDate: values.purchaseDate,
      supplierName: values.supplierName,
      invoiceNumber: values.invoiceNumber || null,
      paymentStatus: values.paymentStatus,
      lineItems: values.lineItems,
      notes: values.notes ?? null,
    });

    if (trialId) {
      tempSaveReceivePerf(trialId, 'createPurchaseAction return', {
        ms: Math.round(performance.now() - createStartedAt),
        success: result.success,
      });
    }

    if (!result.success) {
      const fieldError = mapPurchaseActionError(result.code);

      if (fieldError) {
        setServerFieldError(fieldError);
      }

      toastFormError(result.error);
      return null;
    }

    rememberSupplier(values.supplierName);

    // Do not block Save Draft / Save & Receive on list/dashboard refetch.
    void Promise.all([
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
    setSubmitMode('draft');

    try {
      const purchase = await saveDraft(values);

      if (!purchase) {
        return;
      }

      toast.success('Purchase saved as draft');
      router.push(`/purchases/${purchase.id}`);
    } finally {
      setIsSubmitting(false);
      setSubmitMode(null);
    }
  }

  async function handleConfirmReceive() {
    if (!pendingValues || confirmReceiveInFlightRef.current) {
      return;
    }

    confirmReceiveInFlightRef.current = true;
    setIsSubmitting(true);
    setServerFieldError(null);
    setSubmitMode('complete');

    const trialId = `sr-${Date.now()}`;
    const clickStartedAt = performance.now();
    tempSaveReceivePerf(trialId, 'confirm click');

    try {
      let purchaseId = pendingDraftIdRef.current;
      let createMs = 0;
      let gapAfterCreateMs = 0;

      if (!purchaseId) {
        const createStartedAt = performance.now();
        const purchase = await saveDraft(pendingValues, trialId);
        createMs = Math.round(performance.now() - createStartedAt);

        if (!purchase) {
          tempSaveReceivePerf(trialId, 'create failed', {
            clickToFailMs: Math.round(performance.now() - clickStartedAt),
          });
          return;
        }

        purchaseId = purchase.id;
        pendingDraftIdRef.current = purchaseId;
        gapAfterCreateMs = 0;
      }

      const afterCreateAt = performance.now();
      tempSaveReceivePerf(trialId, 'receivePurchaseAction start', { purchaseId });
      const receiveStartedAt = performance.now();
      const receiveResult = await receivePurchaseAction(purchaseId);
      const receiveMs = Math.round(performance.now() - receiveStartedAt);
      gapAfterCreateMs = Math.round(receiveStartedAt - afterCreateAt);
      tempSaveReceivePerf(trialId, 'receivePurchaseAction return', {
        ms: receiveMs,
        success: receiveResult.success,
      });

      if (!receiveResult.success) {
        toastFormError(receiveResult.error);
        tempSaveReceivePerf(trialId, 'receive failed', {
          clickToFailMs: Math.round(performance.now() - clickStartedAt),
          createMs,
          receiveMs,
        });
        return;
      }

      pendingDraftIdRef.current = null;
      setPendingValues(null);
      setConfirmOpen(false);

      // Receive already finished; refresh lists/catalog/dashboard in the background.
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['purchases'] }),
        queryClient.invalidateQueries({ queryKey: ['purchase', purchaseId] }),
        queryClient.invalidateQueries({ queryKey: ['raw-materials'] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
      ]);

      const successAt = performance.now();
      tempSaveReceivePerf(trialId, 'success shown', {
        purchaseNumber: receiveResult.data.purchaseNumber,
        createMs,
        gapCreateToReceiveMs: gapAfterCreateMs,
        receiveMs,
        clickToSuccessMs: Math.round(successAt - clickStartedAt),
        successAfterReceiveMs: Math.round(successAt - receiveStartedAt - receiveMs),
      });

      toast.success('Purchase received. Raw material stock has been updated.');
      router.push(`/purchases/${purchaseId}`);
    } finally {
      confirmReceiveInFlightRef.current = false;
      setIsSubmitting(false);
      setSubmitMode(null);
    }
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

      <PurchaseForm
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
