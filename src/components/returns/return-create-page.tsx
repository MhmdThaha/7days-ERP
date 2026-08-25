'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';

import { completeReturnAction, createReturnAction, getSaleReturnContextAction } from '@/actions/returns';
import { ReturnSalePicker } from '@/components/returns/return-sale-picker';
import { SaleReturnForm } from '@/components/returns/sale-return-form';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { createReturnSchema, type ReturnFormValues } from '@/lib/domain/schemas/return.schema';
import { toastFormError } from '@/lib/utils/toast-form-error';
import {
  invalidateDailyReportQueries,
  invalidateDashboardQueries,
  invalidateMonthlyReportQueries,
  invalidateProductStockQueries,
} from '@/lib/utils/query-invalidation';
import { clearModuleWorkflowOnExit } from '@/lib/navigation/module-workflow-resume';
import { toastDraftSaved, toastWorkflowComplete } from '@/lib/utils/workflow-toasts';

const FORM_ID = 'return-create-form';

export function ReturnCreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const initialSaleId = searchParams.get('saleId');
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(initialSaleId);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    data: saleContext,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['sale-return-context', selectedSaleId],
    queryFn: async () => {
      if (!selectedSaleId) {
        return null;
      }

      const result = await getSaleReturnContextAction(selectedSaleId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: Boolean(selectedSaleId),
  });

  async function handleSubmit(values: ReturnFormValues) {
    if (isSubmitting) {
      return;
    }

    const lines = values.lines.filter(
      (line) => Number.isFinite(line.quantity) && line.quantity > 0,
    );

    if (lines.length === 0) {
      toastFormError('Enter a return quantity for at least one product.');
      return;
    }

    setIsSubmitting(true);

    try {
      const parsed = createReturnSchema.parse({
        ...values,
        lines,
        notes: values.notes ?? null,
      });

      const result = await createReturnAction({
        sourceSaleId: parsed.sourceSaleId,
        returnDate: parsed.returnDate,
        reason: parsed.reason,
        lines: parsed.lines,
        notes: parsed.notes ?? null,
      });

      if (!result.success) {
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
              onClick: () => router.push(`/returns/new?saleId=${parsed.sourceSaleId}`),
            },
          });

          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['returns'] }),
            queryClient.invalidateQueries({ queryKey: ['return-entry', returnId] }),
            queryClient.invalidateQueries({ queryKey: ['sale-return-context', parsed.sourceSaleId] }),
            invalidateProductStockQueries(queryClient),
            invalidateDashboardQueries(queryClient),
            invalidateDailyReportQueries(queryClient),
            invalidateMonthlyReportQueries(queryClient),
          ]);

          clearModuleWorkflowOnExit('returns');
          router.push('/returns');
        })();
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['returns'] }),
        queryClient.invalidateQueries({ queryKey: ['sale-return-context', parsed.sourceSaleId] }),
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
        description="Select the original completed sale, then enter return quantities."
      />

      {!selectedSaleId ? (
        <Card>
          <CardHeader>
            <CardTitle>Select Original Sale</CardTitle>
          </CardHeader>
          <CardContent>
            <ReturnSalePicker onSelect={setSelectedSaleId} />
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : error || !saleContext ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">
            Unable to load sale return details.
          </CardContent>
        </Card>
      ) : !saleContext.hasReturnableQuantity ? (
        <Card>
          <CardContent className="space-y-4 py-8 text-center text-sm">
            <p>Everything from {saleContext.saleNumber} has already been returned.</p>
            <Button type="button" variant="outline" onClick={() => setSelectedSaleId(null)}>
              Choose another sale
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle>Return Details</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedSaleId(null)}>
                Change sale
              </Button>
            </CardHeader>
            <CardContent>
              <SaleReturnForm
                formId={FORM_ID}
                saleContext={saleContext}
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
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
        </>
      )}
    </div>
  );
}
