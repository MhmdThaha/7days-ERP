'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { getProductAction } from '@/actions/products';
import { getRecipeAction, updateRecipeAction } from '@/actions/recipes';
import { RecipeForm } from '@/components/recipes/recipe-form';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { RecipeFormValues } from '@/lib/domain/schemas/recipe.schema';
import {
  mapRecipeActionError,
  type RecipeFieldError,
} from '@/lib/utils/recipe-form-errors';

const FORM_ID = 'recipe-edit-form';

type RecipeEditPageProps = {
  recipeId: string;
};

export function RecipeEditPage({ recipeId }: RecipeEditPageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<RecipeFieldError | null>(null);

  const {
    data: recipe,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['recipe', recipeId],
    queryFn: async () => {
      const result = await getRecipeAction(recipeId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
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
    enabled: Boolean(recipe?.productId),
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
        ingredients: values.ingredients,
        notes: values.notes ?? null,
        isActive: values.isActive,
      });

      if (!result.success) {
        const fieldError = mapRecipeActionError(result.code);

        if (fieldError) {
          setServerFieldError(fieldError);
        }

        toast.error(result.error);
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
      <Alert variant="destructive">
        <AlertTitle>Recipe not found</AlertTitle>
        <AlertDescription>
          {error?.message ?? 'The requested recipe could not be loaded.'}
        </AlertDescription>
      </Alert>
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

      <Card>
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
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          nativeButton={false}
          variant="outline"
          render={<Link href={`/recipes/${recipeId}`} />}
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
