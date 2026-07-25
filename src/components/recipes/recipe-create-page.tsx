'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toastWorkflowComplete } from '@/lib/utils/workflow-toasts';

import { createRecipeAction } from '@/actions/recipes';
import { RecipeForm } from '@/components/recipes/recipe-form';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { RecipeFormValues } from '@/lib/domain/schemas/recipe.schema';
import { toastFormError } from '@/lib/utils/toast-form-error';
import {
  mapRecipeActionError,
  type RecipeFieldError,
} from '@/lib/utils/recipe-form-errors';

const FORM_ID = 'recipe-create-form';

export function RecipeCreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialProductId = searchParams.get('productId') ?? undefined;
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<RecipeFieldError | null>(null);

  async function handleSubmit(values: RecipeFormValues) {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setServerFieldError(null);

    try {
      const result = await createRecipeAction({
        productId: values.productId,
        recipeCode: values.recipeCode || undefined,
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

        toastFormError(result.error);
        return;
      }

      toastWorkflowComplete('Recipe created successfully', {
        nextStep: {
          label: 'Record Production',
          onClick: () => router.push('/production/new'),
        },
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['recipes'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
      ]);

      router.push(`/recipes/${result.data.id}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/recipes" />}>
          <ArrowLeft />
          Back to Recipes
        </Button>
      </div>

      <PageHeader
        title="Create Recipe"
        description="Select a product and define its raw material ingredients."
      />

      <Card>
        <CardHeader>
          <CardTitle>Recipe Builder</CardTitle>
        </CardHeader>
        <CardContent>
          <RecipeForm
            formId={FORM_ID}
            initialProductId={initialProductId}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            serverFieldError={serverFieldError}
            onServerFieldErrorHandled={() => setServerFieldError(null)}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button nativeButton={false} variant="outline" render={<Link href="/recipes" />} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" form={FORM_ID} disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create Recipe'}
        </Button>
      </div>
    </div>
  );
}
