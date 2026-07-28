'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { completeProductionAction, createProductionAction, getProductionAction, listProductionsAction } from '@/actions/production';
import { ProductionForm } from '@/components/production/production-form';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EntrySuccessBanner } from '@/components/shared/entry-success-banner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProductionFormValues } from '@/lib/domain/schemas/production.schema';
import { toastFormError } from '@/lib/utils/toast-form-error';
import {
  mapProductionActionError,
  type ProductionFieldError,
} from '@/lib/utils/production-form-errors';
import {
  invalidateDailyReportQueries,
  invalidateDashboardQueries,
  invalidateMonthlyReportQueries,
} from '@/lib/utils/query-invalidation';

const FORM_ID = 'production-create-form';

type SuccessState = {
  productionNumber: string;
};

export function ProductionCreatePage() {
  const queryClient = useQueryClient();
  const submitIntentRef = useRef<'draft' | 'complete'>('draft');
  const pendingDraftIdRef = useRef<string | null>(null);
  const [submitMode, setSubmitMode] = useState<'draft' | 'complete' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<ProductionFieldError | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<ProductionFormValues | null>(null);
  const [successState, setSuccessState] = useState<SuccessState | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [repeatLines, setRepeatLines] = useState<ProductionFormValues['lines'] | null>(null);
  const [isRepeating, setIsRepeating] = useState(false);

  async function saveDraft(values: ProductionFormValues) {
    const result = await createProductionAction({
      productionDate: values.productionDate,
      lines: values.lines,
      notes: values.notes ?? null,
    });

    if (!result.success) {
      const fieldError = mapProductionActionError(result.code);

      if (fieldError) {
        setServerFieldError(fieldError);
      }

      toastFormError(result.error);
      return null;
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['productions'] }),
      invalidateDashboardQueries(queryClient),
      invalidateDailyReportQueries(queryClient),
      invalidateMonthlyReportQueries(queryClient),
    ]);

    return result.data;
  }

  async function handleSubmit(values: ProductionFormValues) {
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
      const production = await saveDraft(values);

      if (!production) {
        return;
      }

      toast.success('Production saved as draft');
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
      let productionId = pendingDraftIdRef.current;

      if (!productionId) {
        const production = await saveDraft(pendingValues);

        if (!production) {
          return;
        }

        productionId = production.id;
        pendingDraftIdRef.current = productionId;
      }

      const completeResult = await completeProductionAction(productionId);

      if (!completeResult.success) {
        toastFormError(completeResult.error);
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['productions'] }),
        queryClient.invalidateQueries({ queryKey: ['production', productionId] }),
        queryClient.invalidateQueries({ queryKey: ['raw-materials'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);

      pendingDraftIdRef.current = null;
      setSuccessState({ productionNumber: completeResult.data.productionNumber });
      setPendingValues(null);
      setConfirmOpen(false);
      setFormKey((current) => current + 1);
    } finally {
      setIsSubmitting(false);
      setSubmitMode(null);
    }
  }

  function handleNewProduction() {
    setSuccessState(null);
    setRepeatLines(null);
    setFormKey((current) => current + 1);
  }

  async function handleRepeatLastProduction() {
    if (isSubmitting || isRepeating) {
      return;
    }

    setIsRepeating(true);

    try {
      const listResult = await listProductionsAction({
        page: 1,
        pageSize: 1,
        status: 'all',
      });

      if (!listResult.success) {
        toastFormError(listResult.error);
        return;
      }

      const latestProduction = listResult.data.items[0];

      if (!latestProduction) {
        toast.error('No previous production found.');
        return;
      }

      const productionResult = await getProductionAction(latestProduction.id);

      if (!productionResult.success) {
        toastFormError(productionResult.error);
        return;
      }

      const lines = productionResult.data.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unit: line.unit,
      }));

      setSuccessState(null);
      setRepeatLines(lines);
      setFormKey((current) => current + 1);
      toast.success(
        `Loaded ${lines.length} product line${lines.length === 1 ? '' : 's'} from ${productionResult.data.productionNumber}.`,
      );
    } finally {
      setIsRepeating(false);
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
        <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/production" />}>
          <ArrowLeft />
          Back to Production
        </Button>
      </div>

      <PageHeader
        title="Record Production"
        description="Enter products and quantities for today's production. Save as draft to finish later, or save and complete to update inventory immediately."
      >
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting || isRepeating}
          onClick={() => void handleRepeatLastProduction()}
        >
          <RotateCcw />
          {isRepeating ? 'Loading…' : 'Repeat Last Production'}
        </Button>
      </PageHeader>

      {successState ? (
        <EntrySuccessBanner
          title="Production completed"
          description={`${successState.productionNumber} completed. Raw materials deducted and product stock updated.`}
          actionLabel="Record another production"
          onAction={handleNewProduction}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Production Details</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductionForm
            key={formKey}
            formId={FORM_ID}
            initialLines={repeatLines ?? undefined}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            serverFieldError={serverFieldError}
            onServerFieldErrorHandled={() => setServerFieldError(null)}
            footerActions={
              <>
                <Button
                  nativeButton={false}
                  variant="outline"
                  render={<Link href="/production" />}
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
                  {isSubmitting && submitMode === 'draft'
                    ? 'Saving...'
                    : 'Save Draft'}
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
        title="Complete Production"
        description={
          pendingValues
            ? `Complete this production batch? Raw materials will be deducted and product stock updated for ${lineCount} product line${lineCount === 1 ? '' : 's'}. This cannot be undone.`
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
