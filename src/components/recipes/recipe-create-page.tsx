'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { createRecipeAction } from '@/actions/recipes';
import { RecipeForm } from '@/components/recipes/recipe-form';
import { EntrySuccessBanner } from '@/components/shared/entry-success-banner';
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

type SuccessState = {
  recipeName: string;
};

export function RecipeCreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialProductId = searchParams.get('productId') ?? undefined;
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<RecipeFieldError | null>(null);
  const [successState, setSuccessState] = useState<SuccessState | null>(null);
  const [formKey, setFormKey] = useState(0);

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

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['recipes'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
      ]);

      setSuccessState({ recipeName: result.data.recipeName });
      setFormKey((current) => current + 1);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleNewRecipe() {
    setSuccessState(null);
    setFormKey((current) => current + 1);
  }

  function handleViewRecipes() {
    router.push('/recipes');
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

      {successState ? (
        <EntrySuccessBanner
          title="Recipe created"
          description={`${successState.recipeName} was created successfully.`}
          actionLabel="Create another recipe"
          onAction={handleNewRecipe}
        />
      ) : null}

      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle>Recipe Builder</CardTitle>
        </CardHeader>
        <CardContent>
          <RecipeForm
            key={formKey}
            formId={FORM_ID}
            initialProductId={initialProductId}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            serverFieldError={serverFieldError}
            onServerFieldErrorHandled={() => setServerFieldError(null)}
            footerActions={
              <>
                <Button
                  nativeButton={false}
                  variant="outline"
                  render={<Link href="/recipes" />}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                {successState ? (
                  <Button type="button" variant="outline" onClick={handleViewRecipes}>
                    View recipes
                  </Button>
                ) : null}
                <Button type="submit" form={FORM_ID} disabled={isSubmitting}>
                  {isSubmitting ? 'Creating...' : 'Create Recipe'}
                </Button>
              </>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
