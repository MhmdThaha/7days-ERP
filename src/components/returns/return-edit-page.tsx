'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { getReturnAction, updateReturnAction } from '@/actions/returns';
import { ReturnForm } from '@/components/returns/return-form';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ReturnFormValues } from '@/lib/domain/schemas/return.schema';
import { toastFormError } from '@/lib/utils/toast-form-error';
import { mapReturnActionError, type ReturnFieldError } from '@/lib/utils/return-form-errors';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries } from '@/lib/utils/query-invalidation';

const FORM_ID = 'return-edit-form';

type ReturnEditPageProps = {
  returnId: string;
};

export function ReturnEditPage({ returnId }: ReturnEditPageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<ReturnFieldError | null>(null);

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
  });

  async function handleSubmit(values: ReturnFormValues) {
    if (isSubmitting || !returnEntry) {
      return;
    }

    setIsSubmitting(true);
    setServerFieldError(null);

    try {
      const result = await updateReturnAction(returnId, {
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

      toast.success('Return draft updated successfully');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['returns'] }),
        queryClient.invalidateQueries({ queryKey: ['return-entry', returnId] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);

      router.push(`/returns/${returnId}`);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button
          nativeButton={false}
          variant="ghost"
          size="sm"
          render={<Link href={`/returns/${returnId}`} />}
        >
          <ArrowLeft />
          Back to Return
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
          <ReturnForm
            formId={FORM_ID}
            returnEntry={returnEntry}
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
          render={<Link href={`/returns/${returnId}`} />}
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
