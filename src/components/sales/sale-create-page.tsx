'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { createSaleAction, completeSaleAction } from '@/actions/sales';
import { SaleForm } from '@/components/sales/sale-form';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import type { SaleFormValues } from '@/lib/domain/schemas/sale.schema';
import { rememberCustomer } from '@/lib/utils/form-recent-values';
import { mapSaleActionError, type SaleFieldError } from '@/lib/utils/sale-form-errors';
import { toastFormError } from '@/lib/utils/toast-form-error';
import { resolveDraftIdForCompletion } from '@/lib/utils/sale-complete-draft';
import { moduleDetailPath, moduleListPath } from '@/lib/navigation/module-workflow-navigation';
import { clearModuleWorkflowOnExit } from '@/lib/navigation/module-workflow-resume';
import {
  invalidateDailyReportQueries,
  invalidateDashboardQueries,
  invalidateMonthlyReportQueries,
  invalidateProductStockQueries,
} from '@/lib/utils/query-invalidation';

const FORM_ID = 'sale-create-form';

export function SaleCreatePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const submitIntentRef = useRef<'draft' | 'complete'>('draft');
  const pendingDraftIdRef = useRef<string | null>(null);
  /** Synchronous lock — blocks a second confirm before isSubmitting re-renders. */
  const confirmCompleteInFlightRef = useRef(false);
  const [submitMode, setSubmitMode] = useState<'draft' | 'complete' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<SaleFieldError | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<SaleFormValues | null>(null);
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
      setPendingValues(values);
      setConfirmOpen(true);
      submitIntentRef.current = 'draft';
      return;
    }

    setIsSubmitting(true);
    setServerFieldError(null);
    setSubmitMode('draft');

    try {
      const sale = await saveDraft(values);

      if (!sale) {
        return;
      }

      toast.success('Sale saved as draft');
      router.replace(moduleDetailPath('sales', sale.id));
    } finally {
      setIsSubmitting(false);
      setSubmitMode(null);
    }
  }

  async function handleConfirmComplete() {
    if (!pendingValues || confirmCompleteInFlightRef.current) {
      return;
    }

    confirmCompleteInFlightRef.current = true;
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

        saleId = resolveDraftIdForCompletion(pendingDraftIdRef.current, sale.id);

        if (!saleId) {
          return;
        }

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
        invalidateProductStockQueries(queryClient),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);

      pendingDraftIdRef.current = null;
      setPendingValues(null);
      setConfirmOpen(false);
      toast.success('Sale completed. Product stock has been updated.');
      clearModuleWorkflowOnExit('sales');
      router.push(moduleListPath('sales'));
    } finally {
      confirmCompleteInFlightRef.current = false;
      setIsSubmitting(false);
      setSubmitMode(null);
    }
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
        description="Add customer and products, then complete to update stock."
      />

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
              variant="ghost"
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
              variant="success"
              size="xl"
              disabled={isSubmitting}
              onClick={handleSaveAndCompleteClick}
            >
              {isSubmitting && submitMode === 'complete' ? 'Completing...' : 'Save & Complete'}
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
