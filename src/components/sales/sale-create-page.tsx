'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';

import { createSaleAction, completeSaleAction } from '@/actions/sales';
import { SaleForm } from '@/components/sales/sale-form';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { SaleFormValues } from '@/lib/domain/schemas/sale.schema';
import { rememberCustomer } from '@/lib/utils/form-recent-values';
import { mapSaleActionError, type SaleFieldError } from '@/lib/utils/sale-form-errors';
import { toastFormError } from '@/lib/utils/toast-form-error';
import { toastDraftSaved, toastWorkflowComplete } from '@/lib/utils/workflow-toasts';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries } from '@/lib/utils/query-invalidation';

const FORM_ID = 'sale-create-form';

export function SaleCreatePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<SaleFieldError | null>(null);

  async function handleSubmit(values: SaleFormValues) {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setServerFieldError(null);

    try {
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
        return;
      }

      rememberCustomer(values.customerName ?? '');

      const saleId = result.data.id;

      toastDraftSaved('Sale saved as draft', 'Complete sale', () => {
        void (async () => {
          const completeResult = await completeSaleAction(saleId);

          if (!completeResult.success) {
            toastFormError(completeResult.error);
            return;
          }

          toastWorkflowComplete('Sale completed. Product stock has been updated.', {
            recordAnother: {
              label: 'Record another',
              onClick: () => router.push('/sales/new'),
            },
          });

          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['sales'] }),
            queryClient.invalidateQueries({ queryKey: ['sale', saleId] }),
            queryClient.invalidateQueries({ queryKey: ['products'] }),
            invalidateDashboardQueries(queryClient),
            invalidateDailyReportQueries(queryClient),
            invalidateMonthlyReportQueries(queryClient),
          ]);
        })();
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);

      router.push(`/sales/${saleId}`);
    } finally {
      setIsSubmitting(false);
    }
  }

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
        description="Enter customer details and product lines. This saves a draft sale only — product stock is not changed yet."
      />

      <Card>
        <CardHeader>
          <CardTitle>Sale Details</CardTitle>
        </CardHeader>
        <CardContent>
          <SaleForm
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
          render={<Link href="/sales" />}
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
