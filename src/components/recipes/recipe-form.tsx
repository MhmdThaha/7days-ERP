'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';

import { listProductsAction } from '@/actions/products';
import { listRawMaterialsAction } from '@/actions/raw-materials';
import { RecipeIngredientRow } from '@/components/recipes/recipe-ingredient-row';
import { RecipeSummary } from '@/components/recipes/recipe-summary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  recipeFormSchema,
  type RecipeFormValues,
} from '@/lib/domain/schemas/recipe.schema';
import {
  focusRecipeFormField,
  type RecipeFieldError,
} from '@/lib/utils/recipe-form-errors';
import type { Recipe } from '@/types/recipe';
import type { ProductListItem } from '@/types/product';

function formatProductLabel(product: ProductListItem): string {
  return `${product.code} - ${product.name}`;
}

type RecipeFormProps = {
  recipe?: Recipe;
  productName?: string;
  isEditMode?: boolean;
  onSubmit: (values: RecipeFormValues) => Promise<void>;
  isSubmitting?: boolean;
  formId: string;
  serverFieldError?: RecipeFieldError | null;
  onServerFieldErrorHandled?: () => void;
};

const defaultValues: RecipeFormValues = {
  productId: '',
  recipeCode: '',
  recipeName: '',
  ingredients: [],
  notes: '',
  isActive: true,
};

export function RecipeForm({
  recipe,
  productName,
  isEditMode = false,
  onSubmit,
  isSubmitting = false,
  formId,
  serverFieldError,
  onServerFieldErrorHandled,
}: RecipeFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    reset,
    control,
    formState: { errors },
  } = useForm<RecipeFormValues>({
    resolver: zodResolver(recipeFormSchema),
    defaultValues,
  });

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: 'ingredients',
  });

  const productId = watch('productId');
  const ingredients = watch('ingredients');
  const isActive = watch('isActive');

  const { data: productsResult, isLoading: isLoadingProducts } = useQuery({
    queryKey: ['products', 'recipe-picker'],
    queryFn: async () => {
      const result = await listProductsAction({
        status: 'active',
        page: 1,
        pageSize: 100,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
  });

  const { data: rawMaterialsResult, isLoading: isLoadingRawMaterials } = useQuery({
    queryKey: ['raw-materials', 'recipe-picker'],
    queryFn: async () => {
      const result = await listRawMaterialsAction({
        status: 'active',
        page: 1,
        pageSize: 100,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
  });

  const products = productsResult?.items ?? [];
  const rawMaterials = rawMaterialsResult?.items ?? [];

  const selectedRawMaterialIds = useMemo(
    () => ingredients.map((ingredient) => ingredient.rawMaterialId).filter(Boolean),
    [ingredients],
  );

  const totalWeight = useMemo(
    () =>
      ingredients.reduce((sum, ingredient) => {
        const quantity = Number(ingredient.quantity);

        if (Number.isNaN(quantity)) {
          return sum;
        }

        return sum + quantity;
      }, 0),
    [ingredients],
  );

  useEffect(() => {
    if (recipe) {
      reset({
        productId: recipe.productId,
        recipeCode: recipe.recipeCode,
        recipeName: recipe.recipeName,
        ingredients: recipe.ingredients.map((ingredient) => ({
          rawMaterialId: ingredient.rawMaterialId,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
        })),
        notes: recipe.notes ?? '',
        isActive: recipe.isActive,
      });
      return;
    }

    reset(defaultValues);
  }, [recipe, reset]);

  useEffect(() => {
    if (!serverFieldError) {
      return;
    }

    setError(serverFieldError.field as keyof RecipeFormValues, {
      message: serverFieldError.message,
    });
    focusRecipeFormField(serverFieldError.field);
    onServerFieldErrorHandled?.();
  }, [serverFieldError, setError, onServerFieldErrorHandled]);

  function handleAddIngredient() {
    append({
      rawMaterialId: '',
      quantity: 0,
      unit: '',
    });
  }

  function handleRawMaterialChange(index: number, rawMaterialId: string) {
    const material = rawMaterials.find((item) => item.id === rawMaterialId);

    if (material) {
      setValue(`ingredients.${index}.unit`, material.unit, { shouldValidate: true });
    }
  }

  const availableProducts = isEditMode
    ? products
    : products.filter((product) => !product.activeRecipeId);

  const productSelectItems = useMemo(
    () =>
      availableProducts.map((product) => ({
        value: product.id,
        label: formatProductLabel(product),
      })),
    [availableProducts],
  );

  const isLoadingPickers = isLoadingProducts || isLoadingRawMaterials;

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="productId">Product</Label>
          {isEditMode ? (
            <Input id="productId" value={productName ?? 'Selected product'} readOnly disabled />
          ) : (
            <Select
              value={productId || null}
              items={productSelectItems}
              onValueChange={(value) => {
                if (value) {
                  setValue('productId', value, { shouldValidate: true });
                }
              }}
              disabled={isSubmitting || isLoadingPickers}
            >
              <SelectTrigger id="productId" aria-invalid={Boolean(errors.productId)}>
                <SelectValue placeholder="Select a product" />
              </SelectTrigger>
              <SelectContent>
                {availableProducts.map((product) => (
                  <SelectItem
                    key={product.id}
                    value={product.id}
                    label={formatProductLabel(product)}
                  >
                    {formatProductLabel(product)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {errors.productId ? (
            <p className="text-sm text-destructive">{errors.productId.message}</p>
          ) : null}
          {!isEditMode && availableProducts.length === 0 && !isLoadingPickers ? (
            <p className="text-sm text-muted-foreground">
              All active products already have a recipe. Deactivate or delete an existing recipe
              first.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="recipeCode">Recipe Code</Label>
          <Input
            id="recipeCode"
            placeholder="Auto-generated if left blank"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.recipeCode)}
            {...register('recipeCode')}
          />
          {errors.recipeCode ? (
            <p className="text-sm text-destructive">{errors.recipeCode.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Leave blank to auto-generate (RCP-001).</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="recipeName">Recipe Name</Label>
          <Input
            id="recipeName"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.recipeName)}
            {...register('recipeName')}
          />
          {errors.recipeName ? (
            <p className="text-sm text-destructive">{errors.recipeName.message}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5 sm:col-span-2">
          <Switch
            id="isActive"
            checked={isActive}
            onCheckedChange={(checked) => setValue('isActive', checked)}
            disabled={isSubmitting}
          />
          <Label htmlFor="isActive" className="cursor-pointer font-normal">
            Active recipe
          </Label>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            rows={3}
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.notes)}
            {...register('notes')}
          />
          {errors.notes ? (
            <p className="text-sm text-destructive">{errors.notes.message}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Ingredients</h2>
            <p className="text-sm text-muted-foreground">
              Add raw materials and quantities for this recipe.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleAddIngredient}
            disabled={isSubmitting || isLoadingPickers}
          >
            <Plus />
            Add Ingredient
          </Button>
        </div>

        {errors.ingredients?.message ? (
          <p className="text-sm text-destructive">{errors.ingredients.message}</p>
        ) : null}
        {errors.ingredients?.root?.message ? (
          <p className="text-sm text-destructive">{errors.ingredients.root.message}</p>
        ) : null}

        {fields.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No ingredients yet. Add at least one raw material to build this recipe.
          </div>
        ) : (
          <div className="space-y-3">
            {fields.map((field, index) => (
              <RecipeIngredientRow
                key={field.id}
                index={index}
                register={register}
                setValue={setValue}
                errors={errors}
                rawMaterialId={ingredients[index]?.rawMaterialId ?? ''}
                unit={ingredients[index]?.unit ?? ''}
                rawMaterials={rawMaterials}
                selectedRawMaterialIds={selectedRawMaterialIds}
                disabled={isSubmitting || isLoadingPickers}
                canMoveUp={index > 0}
                canMoveDown={index < fields.length - 1}
                onMoveUp={() => move(index, index - 1)}
                onMoveDown={() => move(index, index + 1)}
                onRemove={() => remove(index)}
                onRawMaterialChange={(rawMaterialId) =>
                  handleRawMaterialChange(index, rawMaterialId)
                }
              />
            ))}
          </div>
        )}
      </div>

      <RecipeSummary ingredientCount={fields.length} totalWeight={totalWeight} />
    </form>
  );
}
