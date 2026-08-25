'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { getSaleAction, updateSaleAction } from '@/actions/sales';
import { SaleForm } from '@/components/sales/sale-form';
import { useClearWorkflowResumeOnFailure } from '@/hooks/use-clear-workflow-resume-on-failure';
import { useAuth } from '@/hooks/use-auth';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { SaleFormValues } from '@/lib/domain/schemas/sale.schema';
import { toastFormError } from '@/lib/utils/toast-form-error';
import { mapSaleActionError, type SaleFieldError } from '@/lib/utils/sale-form-errors';
import { moduleListPath } from '@/lib/navigation/module-workflow-navigation';
import { clearModuleWorkflowOnExit } from '@/lib/navigation/module-workflow-resume';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries } from '@/lib/utils/query-invalidation';

const FORM_ID = 'sale-edit-form';

type SaleEditPageProps = {
  saleId: string;
};

export function SaleEditPage({ saleId }: SaleEditPageProps) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<SaleFieldError | null>(null);
  const { allowNavigation, unsavedChangesDialog } = useUnsavedChangesGuard(isDirty);

  const {
    data: sale,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['sale', saleId],
    queryFn: async () => {
      const result = await getSaleAction(saleId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: isAuthenticated,
  });

  useClearWorkflowResumeOnFailure(
    'sales',
    Boolean(error || !sale || (sale && sale.status !== 'draft')),
  );

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

        toastFormError(result.error);
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

      allowNavigation();
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
      <div className="space-y-4">
        <LoadErrorAlert
          title="Unable to load sale"
          error={error}
          onRetry={() => void refetch()}
          isRetrying={isRefetching}
        />
        {!error ? (
          <Alert variant="destructive">
            <AlertTitle>Sale not found</AlertTitle>
            <AlertDescription>The requested sale could not be loaded.</AlertDescription>
          </Alert>
        ) : null}
      </div>
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
      {unsavedChangesDialog}
      <div className="flex items-center gap-2">
        <Button
          nativeButton={false}
          variant="ghost"
          size="sm"
          render={
            <Link
              href={moduleListPath('sales')}
              onClick={() => clearModuleWorkflowOnExit('sales')}
            />
          }
        >
          <ArrowLeft />
          Back to Sales
        </Button>
      </div>

      <PageHeader
        title="Edit Sale"
        description={`Update draft sale ${sale.saleNumber}.`}
      />

      <SaleForm
        formId={FORM_ID}
        sale={sale}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        serverFieldError={serverFieldError}
        onServerFieldErrorHandled={() => setServerFieldError(null)}
        onDirtyChange={setIsDirty}
        footerActions={
          <>
            <Button
              nativeButton={false}
              variant="ghost"
              render={
                <Link
                  href={moduleListPath('sales')}
                  onClick={() => clearModuleWorkflowOnExit('sales')}
                />
              }
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" form={FORM_ID} variant="success" size="xl" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </>
        }
      />
    </div>
  );
}
