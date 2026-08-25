'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { getWastageAction, updateWastageAction } from '@/actions/wastage';
import { useClearWorkflowResumeOnFailure } from '@/hooks/use-clear-workflow-resume-on-failure';
import { useAuth } from '@/hooks/use-auth';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { WastageForm } from '@/components/wastage/wastage-form';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { WastageFormValues } from '@/lib/domain/schemas/wastage.schema';
import { toastFormError } from '@/lib/utils/toast-form-error';
import { mapWastageActionError, type WastageFieldError } from '@/lib/utils/wastage-form-errors';
import { moduleListPath } from '@/lib/navigation/module-workflow-navigation';
import { clearModuleWorkflowOnExit } from '@/lib/navigation/module-workflow-resume';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries } from '@/lib/utils/query-invalidation';

const FORM_ID = 'wastage-edit-form';

type WastageEditPageProps = {
  wastageId: string;
};

export function WastageEditPage({ wastageId }: WastageEditPageProps) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasStockErrors, setHasStockErrors] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<WastageFieldError | null>(null);
  const { allowNavigation, unsavedChangesDialog } = useUnsavedChangesGuard(isDirty);

  const {
    data: wastage,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['wastage-entry', wastageId],
    queryFn: async () => {
      const result = await getWastageAction(wastageId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: isAuthenticated,
  });

  useClearWorkflowResumeOnFailure(
    'wastage',
    Boolean(error || !wastage || (wastage && wastage.status !== 'draft')),
  );

  async function handleSubmit(values: WastageFormValues) {
    if (isSubmitting || !wastage) {
      return;
    }

    setIsSubmitting(true);
    setServerFieldError(null);

    try {
      const result = await updateWastageAction(wastageId, {
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

      toast.success('Wastage draft updated successfully');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wastage'] }),
        queryClient.invalidateQueries({ queryKey: ['wastage-entry', wastageId] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);

      allowNavigation();
      router.push(`/wastage/${wastageId}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading wastage entry">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !wastage) {
    return (
      <div className="space-y-4">
        <LoadErrorAlert
          title="Unable to load wastage entry"
          error={error}
          onRetry={() => void refetch()}
          isRetrying={isRefetching}
        />
        {!error ? (
          <Alert variant="destructive">
            <AlertTitle>Wastage entry not found</AlertTitle>
            <AlertDescription>The requested wastage entry could not be loaded.</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  if (wastage.status !== 'draft') {
    return (
      <Alert variant="destructive">
        <AlertTitle>Cannot edit wastage</AlertTitle>
        <AlertDescription>Only draft wastage entries can be edited.</AlertDescription>
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
              href={moduleListPath('wastage')}
              onClick={() => clearModuleWorkflowOnExit('wastage')}
            />
          }
        >
          <ArrowLeft />
          Back to Waste & Spoilage
        </Button>
      </div>

      <PageHeader
        title="Edit Wastage"
        description={`Update draft wastage ${wastage.wastageNumber}.`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Wastage Details</CardTitle>
        </CardHeader>
        <CardContent>
          <WastageForm
            formId={FORM_ID}
            wastage={wastage}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            serverFieldError={serverFieldError}
            onServerFieldErrorHandled={() => setServerFieldError(null)}
            onStockValidationChange={setHasStockErrors}
            onDirtyChange={setIsDirty}
          />
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          nativeButton={false}
          variant="outline"
          render={
            <Link
              href={moduleListPath('wastage')}
              onClick={() => clearModuleWorkflowOnExit('wastage')}
            />
          }
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" form={FORM_ID} disabled={isSubmitting || hasStockErrors}>
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
