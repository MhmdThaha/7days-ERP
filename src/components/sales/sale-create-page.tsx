'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { createSaleAction, completeSaleAction } from '@/actions/sales';
import { SaleForm } from '@/components/sales/sale-form';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EntrySuccessBanner } from '@/components/shared/entry-success-banner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { SaleFormValues } from '@/lib/domain/schemas/sale.schema';
import { rememberCustomer } from '@/lib/utils/form-recent-values';
import { mapSaleActionError, type SaleFieldError } from '@/lib/utils/sale-form-errors';
import { toastFormError } from '@/lib/utils/toast-form-error';
import {
  invalidateDailyReportQueries,
  invalidateDashboardQueries,
  invalidateMonthlyReportQueries,
} from '@/lib/utils/query-invalidation';

const FORM_ID = 'sale-create-form';

type SuccessState = {
  saleNumber: string;
};

export function SaleCreatePage() {
  const queryClient = useQueryClient();
  const submitIntentRef = useRef<'draft' | 'complete'>('draft');
  const pendingDraftIdRef = useRef<string | null>(null);
  const [submitMode, setSubmitMode] = useState<'draft' | 'complete' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<SaleFieldError | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<SaleFormValues | null>(null);
  const [successState, setSuccessState] = useState<SuccessState | null>(null);
  const [formKey, setFormKey] = useState(0);

  async function saveDraft(values: SaleFormValues) {
    const result = await createSaleAction({
      saleDate: values.saleDate,
      customerName: values.customerName,
      lines: values.lines,
      notes: values.notes ?? null,
    });

    if (!result.success) {
      const fieldError = mapSaleActionError(result.code);

      if (fieldError) {
        setServerFieldError(fieldError);
      }

      toastFormError(result.error);
      return null;
    }

    rememberCustomer(values.customerName ?? '');

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['sales'] }),
      invalidateDashboardQueries(queryClient),
      invalidateDailyReportQueries(queryClient),
      invalidateMonthlyReportQueries(queryClient),
    ]);

    return result.data;
  }

  async function handleSubmit(values: SaleFormValues) {
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
      const sale = await saveDraft(values);

      if (!sale) {
        return;
      }

      toast.success('Sale saved as draft');
    } finally {
      setIsSubmitting(false);
      setSubmitMode(null);
    }
  }

  async function handleConfirmComplete() {
    if (!pendingValues || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setServerFieldError(null);
    setSubmitMode('complete');

    try {
      let saleId = pendingDraftIdRef.current;

      if (!saleId) {
        const sale = await saveDraft(pendingValues);

        if (!sale) {
          return;
        }

        saleId = sale.id;
        pendingDraftIdRef.current = saleId;
      }

      const completeResult = await completeSaleAction(saleId);

      if (!completeResult.success) {
        toastFormError(completeResult.error);
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
        queryClient.invalidateQueries({ queryKey: ['sale', saleId] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);

      pendingDraftIdRef.current = null;
      setSuccessState({ saleNumber: completeResult.data.saleNumber });
      setPendingValues(null);
      setConfirmOpen(false);
      setFormKey((current) => current + 1);
    } finally {
      setIsSubmitting(false);
      setSubmitMode(null);
    }
  }

  function handleNewSale() {
    setSuccessState(null);
    setFormKey((current) => current + 1);
  }

  function handleSaveDraftClick() {
    submitIntentRef.current = 'draft';
  }

  function handleSaveAndCompleteClick() {
    submitIntentRef.current = 'complete';
  }

  const lineCount = pendingValues?.lines.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/sales" />}>
          <ArrowLeft />
          Back to Sales
        </Button>
      </div>

      <PageHeader
        title="Record Sale"
        description="Enter customer details and product lines. Save as draft to finish later, or save and complete to deduct product stock immediately."
      />

      {successState ? (
        <EntrySuccessBanner
          title="Sale completed"
          description={`${successState.saleNumber} completed. Product stock has been updated.`}
          actionLabel="Record another sale"
          onAction={handleNewSale}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Sale Details</CardTitle>
        </CardHeader>
        <CardContent>
          <SaleForm
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
                  variant="outline"
                  render={<Link href="/sales" />}
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
                  disabled={isSubmitting}
                  onClick={handleSaveAndCompleteClick}
                >
                  {isSubmitting && submitMode === 'complete' ? 'Completing...' : 'Save & Complete'}
                </Button>
              </>
            }
          />
        </CardContent>
      </Card>

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
        title="Complete Sale"
        description={
          pendingValues
            ? `Complete this sale${pendingValues.customerName ? ` for ${pendingValues.customerName}` : ''}? Product stock will be deducted for ${lineCount} line${lineCount === 1 ? '' : 's'}. This cannot be undone.`
            : ''
        }
        confirmLabel="Save & Complete"
        loadingLabel="Completing..."
        isLoading={isSubmitting}
        onConfirm={() => void handleConfirmComplete()}
      />
    </div>
  );
}
