'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';

import { completeReturnAction, createReturnAction } from '@/actions/returns';
import { ReturnForm } from '@/components/returns/return-form';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ReturnFormValues } from '@/lib/domain/schemas/return.schema';
import { toastFormError } from '@/lib/utils/toast-form-error';
import { mapReturnActionError, type ReturnFieldError } from '@/lib/utils/return-form-errors';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries, invalidateProductStockQueries } from '@/lib/utils/query-invalidation';
import { toastDraftSaved, toastWorkflowComplete } from '@/lib/utils/workflow-toasts';

const FORM_ID = 'return-create-form';

export function ReturnCreatePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<ReturnFieldError | null>(null);

  async function handleSubmit(values: ReturnFormValues) {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setServerFieldError(null);

    try {
      const result = await createReturnAction({
        returnDate: values.returnDate,
        reason: values.reason,
        lines: values.lines,
        notes: values.notes ?? null,
      });

      if (!result.success) {
        const fieldError = mapReturnActionError(result.code);

        if (fieldError) {
          setServerFieldError(fieldError);
        }

        toastFormError(result.error);
        return;
      }

      const returnId = result.data.id;

      toastDraftSaved('Return saved as draft', 'Complete return', () => {
        void (async () => {
          const completeResult = await completeReturnAction(returnId);

          if (!completeResult.success) {
            toastFormError(completeResult.error);
            return;
          }

          toastWorkflowComplete('Return completed. Product stock has been restored.', {
            recordAnother: {
              label: 'Record another',
              onClick: () => router.push('/returns/new'),
            },
          });

          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['returns'] }),
            queryClient.invalidateQueries({ queryKey: ['return-entry', returnId] }),
            invalidateProductStockQueries(queryClient),
            invalidateDashboardQueries(queryClient),
            invalidateDailyReportQueries(queryClient),
            invalidateMonthlyReportQueries(queryClient),
          ]);
        })();
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['returns'] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);

      router.push(`/returns/${returnId}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/returns" />}>
          <ArrowLeft />
          Back to Customer Returns
        </Button>
      </div>

      <PageHeader
        title="Record Return"
        description="Enter the reason and product lines. This saves a draft only — product stock is not changed yet."
      />

      <Card>
        <CardHeader>
          <CardTitle>Return Details</CardTitle>
        </CardHeader>
        <CardContent>
          <ReturnForm
            formId={FORM_ID}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            serverFieldError={serverFieldError}
            onServerFieldErrorHandled={() => setServerFieldError(null)}
          />
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          nativeButton={false}
          variant="outline"
          render={<Link href="/returns" />}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" form={FORM_ID} disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Draft'}
        </Button>
      </div>
    </div>
  );
}
