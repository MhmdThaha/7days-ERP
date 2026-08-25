'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';

import { completeWastageAction, createWastageAction } from '@/actions/wastage';
import { WastageForm } from '@/components/wastage/wastage-form';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { WastageFormValues } from '@/lib/domain/schemas/wastage.schema';
import { toastFormError } from '@/lib/utils/toast-form-error';
import { mapWastageActionError, type WastageFieldError } from '@/lib/utils/wastage-form-errors';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries, invalidateProductStockQueries } from '@/lib/utils/query-invalidation';
import { clearModuleWorkflowOnExit } from '@/lib/navigation/module-workflow-resume';
import { toastDraftSaved, toastWorkflowComplete } from '@/lib/utils/workflow-toasts';

const FORM_ID = 'wastage-create-form';

export function WastageCreatePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasStockErrors, setHasStockErrors] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<WastageFieldError | null>(null);

  async function handleSubmit(values: WastageFormValues) {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setServerFieldError(null);

    try {
      const result = await createWastageAction({
        wastageDate: values.wastageDate,
        reason: values.reason,
        lines: values.lines,
        notes: values.notes ?? null,
      });

      if (!result.success) {
        const fieldError = mapWastageActionError(result.code);

        if (fieldError) {
          setServerFieldError(fieldError);
        }

        toastFormError(result.error);
        return;
      }

      const wastageId = result.data.id;

      toastDraftSaved('Wastage saved as draft', 'Complete wastage', () => {
        void (async () => {
          const completeResult = await completeWastageAction(wastageId);

          if (!completeResult.success) {
            toastFormError(completeResult.error);
            return;
          }

          toastWorkflowComplete('Wastage completed. Product stock has been deducted.', {
            recordAnother: {
              label: 'Record another',
              onClick: () => router.push('/wastage/new'),
            },
          });

          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['wastage'] }),
            queryClient.invalidateQueries({ queryKey: ['wastage-entry', wastageId] }),
            invalidateProductStockQueries(queryClient),
            invalidateDashboardQueries(queryClient),
            invalidateDailyReportQueries(queryClient),
            invalidateMonthlyReportQueries(queryClient),
          ]);

          clearModuleWorkflowOnExit('wastage');
          router.push('/wastage');
        })();
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wastage'] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);

      router.push(`/wastage/${wastageId}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/wastage" />}>
          <ArrowLeft />
          Back to Waste & Spoilage
        </Button>
      </div>

      <PageHeader
        title="Record Wastage"
        description="Enter the reason and product lines. This saves a draft only — product stock is not changed yet."
      />

      <Card>
        <CardHeader>
          <CardTitle>Wastage Details</CardTitle>
        </CardHeader>
        <CardContent>
          <WastageForm
            formId={FORM_ID}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            serverFieldError={serverFieldError}
            onServerFieldErrorHandled={() => setServerFieldError(null)}
            onStockValidationChange={setHasStockErrors}
          />
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          nativeButton={false}
          variant="outline"
          render={<Link href="/wastage" />}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" form={FORM_ID} disabled={isSubmitting || hasStockErrors}>
          {isSubmitting ? 'Saving...' : 'Save Draft'}
        </Button>
      </div>
    </div>
  );
}
