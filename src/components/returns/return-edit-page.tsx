'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { getReturnAction, getSaleReturnContextAction, updateReturnAction } from '@/actions/returns';
import { useClearWorkflowResumeOnFailure } from '@/hooks/use-clear-workflow-resume-on-failure';
import { useAuth } from '@/hooks/use-auth';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { ReturnForm } from '@/components/returns/return-form';
import { SaleReturnForm } from '@/components/returns/sale-return-form';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  createReturnSchema,
  legacyReturnFormSchema,
  type LegacyReturnFormValues,
  type ReturnFormValues,
} from '@/lib/domain/schemas/return.schema';
import { toastFormError } from '@/lib/utils/toast-form-error';
import { mapReturnActionError, type ReturnFieldError } from '@/lib/utils/return-form-errors';
import { moduleListPath } from '@/lib/navigation/module-workflow-navigation';
import { clearModuleWorkflowOnExit } from '@/lib/navigation/module-workflow-resume';
import {
  invalidateDailyReportQueries,
  invalidateDashboardQueries,
  invalidateMonthlyReportQueries,
} from '@/lib/utils/query-invalidation';

const FORM_ID = 'return-edit-form';

type ReturnEditPageProps = {
  returnId: string;
};

export function ReturnEditPage({ returnId }: ReturnEditPageProps) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLegacyDirty, setIsLegacyDirty] = useState(false);
  const [isLinkedDirty, setIsLinkedDirty] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<ReturnFieldError | null>(null);
  const isDirty = isLegacyDirty || isLinkedDirty;
  const { allowNavigation, unsavedChangesDialog } = useUnsavedChangesGuard(isDirty);

  const {
    data: returnEntry,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['return-entry', returnId],
    queryFn: async () => {
      const result = await getReturnAction(returnId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: isAuthenticated,
  });

  useClearWorkflowResumeOnFailure(
    'returns',
    Boolean(error || !returnEntry || (returnEntry && returnEntry.status !== 'draft')),
  );

  const { data: saleContext, isLoading: isLoadingSaleContext } = useQuery({
    queryKey: ['sale-return-context', returnEntry?.sourceSaleId],
    queryFn: async () => {
      if (!returnEntry?.sourceSaleId) {
        return null;
      }

      const result = await getSaleReturnContextAction(returnEntry.sourceSaleId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: isAuthenticated && Boolean(returnEntry?.sourceSaleId),
  });

  async function handleLinkedSubmit(values: ReturnFormValues) {
    if (isSubmitting || !returnEntry) {
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
    setServerFieldError(null);

    try {
      const parsed = createReturnSchema.parse({
        ...values,
        lines,
        notes: values.notes ?? null,
      });

      const result = await updateReturnAction(returnId, {
        returnDate: parsed.returnDate,
        reason: parsed.reason,
        lines: parsed.lines,
        notes: parsed.notes ?? null,
      });

      if (!result.success) {
        const fieldError = mapReturnActionError(result.code);

        if (fieldError) {
          setServerFieldError(fieldError);
        }

        toastFormError(result.error);
        return;
      }

      toast.success('Return draft updated successfully');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['returns'] }),
        queryClient.invalidateQueries({ queryKey: ['return-entry', returnId] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);

      allowNavigation();
      router.push(`/returns/${returnId}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLegacySubmit(values: LegacyReturnFormValues) {
    if (isSubmitting || !returnEntry) {
      return;
    }

    setIsSubmitting(true);
    setServerFieldError(null);

    try {
      const parsed = legacyReturnFormSchema.parse({
        ...values,
        notes: values.notes ?? null,
      });

      toastFormError('Legacy returns cannot change product lines. Create a new sale-linked return instead.');
      void parsed;
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading return">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !returnEntry) {
    return (
      <div className="space-y-4">
        <LoadErrorAlert
          title="Unable to load return"
          error={error}
          onRetry={() => void refetch()}
          isRetrying={isRefetching}
        />
        {!error ? (
          <Alert variant="destructive">
            <AlertTitle>Return not found</AlertTitle>
            <AlertDescription>The requested return could not be loaded.</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  if (returnEntry.status !== 'draft') {
    return (
      <Alert variant="destructive">
        <AlertTitle>Cannot edit return</AlertTitle>
        <AlertDescription>Only draft returns can be edited.</AlertDescription>
      </Alert>
    );
  }

  const isLinked = Boolean(returnEntry.sourceSaleId);

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
              href={moduleListPath('returns')}
              onClick={() => clearModuleWorkflowOnExit('returns')}
            />
          }
        >
          <ArrowLeft />
          Back to Customer Returns
        </Button>
      </div>

      <PageHeader
        title="Edit Return"
        description={`Update draft return ${returnEntry.returnNumber}.`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Return Details</CardTitle>
        </CardHeader>
        <CardContent>
          {isLinked ? (
            isLoadingSaleContext || !saleContext ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <SaleReturnForm
                formId={FORM_ID}
                saleContext={saleContext}
                returnEntry={returnEntry}
                onSubmit={handleLinkedSubmit}
                isSubmitting={isSubmitting}
                onDirtyChange={setIsLinkedDirty}
              />
            )
          ) : (
            <ReturnForm
              formId={FORM_ID}
              returnEntry={returnEntry}
              onSubmit={handleLegacySubmit}
              isSubmitting={isSubmitting}
              serverFieldError={serverFieldError}
              onServerFieldErrorHandled={() => setServerFieldError(null)}
              onDirtyChange={setIsLegacyDirty}
            />
          )}
        </CardContent>
      </Card>

      {isLinked ? (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            nativeButton={false}
            variant="outline"
            render={
              <Link
                href={moduleListPath('returns')}
                onClick={() => clearModuleWorkflowOnExit('returns')}
              />
            }
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
