'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { getSaleAction, updateSaleAction } from '@/actions/sales';
import { SaleForm } from '@/components/sales/sale-form';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { SaleFormValues } from '@/lib/domain/schemas/sale.schema';
import { mapSaleActionError, type SaleFieldError } from '@/lib/utils/sale-form-errors';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries } from '@/lib/utils/query-invalidation';

const FORM_ID = 'sale-edit-form';

type SaleEditPageProps = {
  saleId: string;
};

export function SaleEditPage({ saleId }: SaleEditPageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<SaleFieldError | null>(null);

  const {
    data: sale,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['sale', saleId],
    queryFn: async () => {
      const result = await getSaleAction(saleId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
  });

  async function handleSubmit(values: SaleFormValues) {
    if (isSubmitting || !sale) {
      return;
    }

    setIsSubmitting(true);
    setServerFieldError(null);

    try {
      const result = await updateSaleAction(saleId, {
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

        toast.error(result.error);
        return;
      }

      toast.success('Sale draft updated successfully');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
        queryClient.invalidateQueries({ queryKey: ['sale', saleId] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);

      router.push(`/sales/${saleId}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading sale">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !sale) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Sale not found</AlertTitle>
        <AlertDescription>
          {error?.message ?? 'The requested sale could not be loaded.'}
        </AlertDescription>
      </Alert>
    );
  }

  if (sale.status !== 'draft') {
    return (
      <Alert variant="destructive">
        <AlertTitle>Cannot edit sale</AlertTitle>
        <AlertDescription>Only draft sales can be edited.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button
          nativeButton={false}
          variant="ghost"
          size="sm"
          render={<Link href={`/sales/${saleId}`} />}
        >
          <ArrowLeft />
          Back to Sale
        </Button>
      </div>

      <PageHeader
        title="Edit Sale"
        description={`Update draft sale ${sale.saleNumber}.`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Sale Details</CardTitle>
        </CardHeader>
        <CardContent>
          <SaleForm
            formId={FORM_ID}
            sale={sale}
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
          render={<Link href={`/sales/${saleId}`} />}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" form={FORM_ID} disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
