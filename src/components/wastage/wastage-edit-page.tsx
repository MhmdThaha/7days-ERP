'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { getWastageAction, updateWastageAction } from '@/actions/wastage';
import { WastageForm } from '@/components/wastage/wastage-form';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { WastageFormValues } from '@/lib/domain/schemas/wastage.schema';
import { mapWastageActionError, type WastageFieldError } from '@/lib/utils/wastage-form-errors';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries } from '@/lib/utils/query-invalidation';

const FORM_ID = 'wastage-edit-form';

type WastageEditPageProps = {
  wastageId: string;
};

export function WastageEditPage({ wastageId }: WastageEditPageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasStockErrors, setHasStockErrors] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<WastageFieldError | null>(null);

  const {
    data: wastage,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['wastage-entry', wastageId],
    queryFn: async () => {
      const result = await getWastageAction(wastageId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
  });

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

        toast.error(result.error);
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
      <Alert variant="destructive">
        <AlertTitle>Wastage entry not found</AlertTitle>
        <AlertDescription>
          {error?.message ?? 'The requested wastage entry could not be loaded.'}
        </AlertDescription>
      </Alert>
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
      <div className="flex items-center gap-2">
        <Button
          nativeButton={false}
          variant="ghost"
          size="sm"
          render={<Link href={`/wastage/${wastageId}`} />}
        >
          <ArrowLeft />
          Back to Wastage Entry
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
          />
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          nativeButton={false}
          variant="outline"
          render={<Link href={`/wastage/${wastageId}`} />}
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
