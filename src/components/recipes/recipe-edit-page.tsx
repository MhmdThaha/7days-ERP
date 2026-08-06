'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { getProductAction } from '@/actions/products';
import { useAuth } from '@/hooks/use-auth';
import { getRecipeAction, updateRecipeAction } from '@/actions/recipes';
import { RecipeForm } from '@/components/recipes/recipe-form';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { RecipeFormValues } from '@/lib/domain/schemas/recipe.schema';
import { toastFormError } from '@/lib/utils/toast-form-error';
import {
  mapRecipeActionError,
  type RecipeFieldError,
} from '@/lib/utils/recipe-form-errors';

const FORM_ID = 'recipe-edit-form';

type RecipeEditPageProps = {
  recipeId: string;
};

export function RecipeEditPage({ recipeId }: RecipeEditPageProps) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<RecipeFieldError | null>(null);

  const {
    data: recipe,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['recipe', recipeId],
    queryFn: async () => {
      const result = await getRecipeAction(recipeId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: isAuthenticated,
  });

  const { data: product } = useQuery({
    queryKey: ['product', recipe?.productId],
    queryFn: async () => {
      const result = await getProductAction(recipe!.productId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: isAuthenticated && Boolean(recipe?.productId),
  });

  async function handleSubmit(values: RecipeFormValues) {
    if (isSubmitting || !recipe) {
      return;
    }

    setIsSubmitting(true);
    setServerFieldError(null);

    try {
      const result = await updateRecipeAction(recipeId, {
        recipeName: values.recipeName,
        batchOutputQuantity: values.batchOutputQuantity ?? null,
        targetWeightGrams: values.targetWeightGrams ?? null,
        ingredients: values.ingredients,
        notes: values.notes ?? null,
        isActive: values.isActive,
      });

      if (!result.success) {
        const fieldError = mapRecipeActionError(result.code);

        if (fieldError) {
          setServerFieldError(fieldError);
        }

        toastFormError(result.error);
        return;
      }

      toast.success('Recipe updated successfully');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['recipes'] }),
        queryClient.invalidateQueries({ queryKey: ['recipe', recipeId] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
      ]);

      router.push(`/recipes/${recipeId}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading recipe">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="space-y-4">
        <LoadErrorAlert
          title="Unable to load recipe"
          error={error}
          onRetry={() => void refetch()}
          isRetrying={isRefetching}
        />
        {!error ? (
          <Alert variant="destructive">
            <AlertTitle>Recipe not found</AlertTitle>
            <AlertDescription>The requested recipe could not be loaded.</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button nativeButton={false} variant="ghost" size="sm" render={<Link href={`/recipes/${recipeId}`} />}>
          <ArrowLeft />
          Back to Recipe
        </Button>
      </div>

      <PageHeader
        title="Edit Recipe"
        description={`Update ingredients and settings for ${recipe.recipeName}.`}
      />

      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle>Recipe Builder</CardTitle>
        </CardHeader>
        <CardContent>
          <RecipeForm
            formId={FORM_ID}
            recipe={recipe}
            productName={product?.name}
            isEditMode
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            serverFieldError={serverFieldError}
            onServerFieldErrorHandled={() => setServerFieldError(null)}
            footerActions={
              <>
                <Button
                  nativeButton={false}
                  variant="outline"
                  render={<Link href={`/recipes/${recipeId}`} />}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" form={FORM_ID} variant="success" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
