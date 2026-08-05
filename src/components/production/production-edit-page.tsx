'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { getProductionAction, updateProductionAction } from '@/actions/production';
import { useAuth } from '@/hooks/use-auth';
import { ProductionForm } from '@/components/production/production-form';
import { RecipeChangedDialog } from '@/components/production/recipe-changed-dialog';
import { useDraftRecipeVersionCheck } from '@/components/production/use-draft-recipe-version-check';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProductionFormValues } from '@/lib/domain/schemas/production.schema';
import { toastFormError } from '@/lib/utils/toast-form-error';
import {
  mapProductionActionError,
  type ProductionFieldError,
} from '@/lib/utils/production-form-errors';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries } from '@/lib/utils/query-invalidation';

const FORM_ID = 'production-edit-form';

type ProductionEditPageProps = {
  productionId: string;
};

export function ProductionEditPage({ productionId }: ProductionEditPageProps) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<ProductionFieldError | null>(null);

  const {
    data: production,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['production', productionId],
    queryFn: async () => {
      const result = await getProductionAction(productionId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: isAuthenticated,
  });

  const {
    dialogOpen: recipeChangedDialogOpen,
    isUpdatingDraft: isUpdatingDraftRecipe,
    handleUpdateDraft,
    handleContinueWithCurrentDraft,
    handleClose: handleCloseRecipeChangedDialog,
    setDialogOpen: setRecipeChangedDialogOpen,
  } = useDraftRecipeVersionCheck({
    production,
    productionId,
    isAuthenticated,
    queryClient,
  });

  async function handleSubmit(values: ProductionFormValues) {
    if (isSubmitting || !production) {
      return;
    }

    setIsSubmitting(true);
    setServerFieldError(null);

    try {
      const result = await updateProductionAction(productionId, {
        productionDate: values.productionDate,
        lines: values.lines,
        notes: values.notes ?? null,
      });

      if (!result.success) {
        const fieldError = mapProductionActionError(result.code);

        if (fieldError) {
          setServerFieldError(fieldError);
        }

        toastFormError(result.error);
        return;
      }

      toast.success('Production draft updated successfully');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['productions'] }),
        queryClient.invalidateQueries({ queryKey: ['production', productionId] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);

      router.push(`/production/${productionId}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading production">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !production) {
    return (
      <div className="space-y-4">
        <LoadErrorAlert
          title="Unable to load production entry"
          error={error}
          onRetry={() => void refetch()}
          isRetrying={isRefetching}
        />
        {!error ? (
          <Alert variant="destructive">
            <AlertTitle>Production entry not found</AlertTitle>
            <AlertDescription>The requested production entry could not be loaded.</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  if (production.status !== 'draft') {
    return (
      <Alert variant="destructive">
        <AlertTitle>Cannot edit production</AlertTitle>
        <AlertDescription>Only draft production entries can be edited.</AlertDescription>
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
          render={<Link href={`/production/${productionId}`} />}
        >
          <ArrowLeft />
          Back to Production
        </Button>
      </div>

      <PageHeader
        title="Edit Production"
        description={`Update draft production ${production.productionNumber}.`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Production Details</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductionForm
            formId={FORM_ID}
            production={production}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            serverFieldError={serverFieldError}
            onServerFieldErrorHandled={() => setServerFieldError(null)}
            footerActions={
              <>
                <Button
                  nativeButton={false}
                  variant="outline"
                  render={<Link href={`/production/${productionId}`} />}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" form={FORM_ID} disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </>
            }
          />
        </CardContent>
      </Card>

      <RecipeChangedDialog
        open={recipeChangedDialogOpen}
        onOpenChange={setRecipeChangedDialogOpen}
        isUpdating={isUpdatingDraftRecipe}
        onUpdateDraft={() => void handleUpdateDraft()}
        onContinueWithCurrentDraft={handleContinueWithCurrentDraft}
        onClose={handleCloseRecipeChangedDialog}
      />
    </div>
  );
}
