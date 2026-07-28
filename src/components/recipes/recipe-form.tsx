'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';

import { getRawMaterialAction } from '@/actions/raw-materials';
import { RecipeIngredientRow } from '@/components/recipes/recipe-ingredient-row';
import { RecipeSummary } from '@/components/recipes/recipe-summary';
import { LineItemsGrid } from '@/components/shared/line-items-grid/line-items-grid';
import { EntryFormStickyFooter } from '@/components/shared/entry-form-sticky-footer';
import { ProductPickerCombobox } from '@/components/shared/product-picker-combobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAutoFirstLine } from '@/hooks/use-auto-first-line';
import { useRawMaterialsByIds } from '@/hooks/use-raw-materials-by-ids';
import {
  recipeFormSchema,
  type RecipeFormValues,
} from '@/lib/domain/schemas/recipe.schema';
import { sumQuantitiesAsKg } from '@/lib/domain/units/mass-conversion';
import {
  focusFirstRecipeFormError,
  focusRecipeFormField,
  focusRecipeIngredientField,
  type RecipeFieldError,
} from '@/lib/utils/recipe-form-errors';
import {
  RECIPE_GRID_MIN_WIDTH,
  RECIPE_GRID_ROW_CLASS,
  RECIPE_LINE_COLUMNS,
} from '@/lib/ui/line-items-grid-config';
import { toRawMaterialListItem } from '@/lib/utils/catalog-list-item';
import type { Recipe } from '@/types/recipe';
import type { ProductListItem } from '@/types/product';

type RecipeFormProps = {
  recipe?: Recipe;
  productName?: string;
  initialProductId?: string;
  isEditMode?: boolean;
  onSubmit: (values: RecipeFormValues) => Promise<void>;
  isSubmitting?: boolean;
  formId: string;
  serverFieldError?: RecipeFieldError | null;
  onServerFieldErrorHandled?: () => void;
  footerActions?: ReactNode;
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
  initialProductId,
  isEditMode = false,
  onSubmit,
  isSubmitting = false,
  formId,
  serverFieldError,
  onServerFieldErrorHandled,
  footerActions,
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
  const ingredients =
    useWatch({ control, name: 'ingredients', defaultValue: defaultValues.ingredients }) ?? [];
  const isActive = watch('isActive');

  const ingredientCount = ingredients.length;

  const totalWeight = useMemo(
    () =>
      sumQuantitiesAsKg(
        ingredients.map((ingredient) => ({
          quantity: Number(ingredient.quantity),
          unit: ingredient.unit,
        })),
      ),
    [ingredients],
  );

  const appendEmptyIngredient = useCallback(() => {
    append({
      rawMaterialId: '',
      quantity: 0,
      unit: '',
    });
  }, [append]);

  const selectedRawMaterialIds = useMemo(
    () => ingredients.map((ingredient) => ingredient.rawMaterialId).filter(Boolean),
    [ingredients],
  );

  const { rawMaterialsById } = useRawMaterialsByIds(selectedRawMaterialIds);

  const filterProductWithoutRecipe = useCallback(
    (product: ProductListItem) => !product.activeRecipeId,
    [],
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

    if (initialProductId) {
      reset({
        ...defaultValues,
        productId: initialProductId,
      });
      return;
    }

    reset(defaultValues);
  }, [recipe, initialProductId, reset]);

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
    appendEmptyIngredient();
  }

  function handleInvalidSubmit(fieldErrors: typeof errors) {
    focusFirstRecipeFormError(fieldErrors);
  }

  async function handleRawMaterialChange(index: number, rawMaterialId: string) {
    let material = rawMaterialsById.get(rawMaterialId);

    if (!material) {
      const result = await getRawMaterialAction(rawMaterialId);

      if (result.success) {
        material = toRawMaterialListItem(result.data);
      }
    }

    if (material) {
      setValue(`ingredients.${index}.unit`, material.unit, { shouldValidate: true });
    }
  }

  useAutoFirstLine(Boolean(recipe), fields.length, true, appendEmptyIngredient);

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit, handleInvalidSubmit)} className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="productId">Product</Label>
          {isEditMode ? (
            <Input id="productId" value={productName ?? 'Selected product'} readOnly disabled />
          ) : (
            <ProductPickerCombobox
              id="productId"
              value={productId || null}
              filterProduct={filterProductWithoutRecipe}
              onValueChange={(value) => setValue('productId', value, { shouldValidate: true })}
              emptyMessage="No products without a recipe match your search."
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.productId)}
            />
          )}
          {errors.productId ? (
            <p className="text-sm text-destructive">{errors.productId.message}</p>
          ) : null}
          {!isEditMode ? (
            <p className="text-sm text-muted-foreground">
              Search for an active product that does not already have a recipe.
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

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-0.5">
                <h2 className="text-base font-semibold">Ingredients</h2>
                <p className="text-sm text-muted-foreground">
                  Add raw materials and quantities for this recipe.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleAddIngredient}
                disabled={isSubmitting}
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
              <LineItemsGrid
                columns={RECIPE_LINE_COLUMNS}
                rowClassName={RECIPE_GRID_ROW_CLASS}
                minWidthClassName={RECIPE_GRID_MIN_WIDTH}
              >
                {fields.map((field, index) => (
                  <RecipeIngredientRow
                    key={field.id}
                    index={index}
                    register={register}
                    setValue={setValue}
                    errors={errors}
                    rawMaterialId={ingredients[index]?.rawMaterialId ?? ''}
                    unit={ingredients[index]?.unit ?? ''}
                    selectedRawMaterialIds={selectedRawMaterialIds}
                    disabled={isSubmitting}
                    canMoveUp={index > 0}
                    canMoveDown={index < fields.length - 1}
                    onMoveUp={() => move(index, index - 1)}
                    onMoveDown={() => move(index, index + 1)}
                    onRemove={() => remove(index)}
                    onRawMaterialChange={(rawMaterialId) =>
                      handleRawMaterialChange(index, rawMaterialId)
                    }
                    onAdvanceToNextLine={() => {
                      const nextIndex = index + 1;
                      const didAppend = nextIndex >= fields.length;

                      if (didAppend) {
                        appendEmptyIngredient();
                        window.requestAnimationFrame(() => {
                          window.requestAnimationFrame(() => {
                            focusRecipeIngredientField(nextIndex, 'rawMaterialId');
                          });
                        });
                        return;
                      }

                      focusRecipeIngredientField(nextIndex, 'rawMaterialId');
                    }}
                  />
                ))}
              </LineItemsGrid>
            )}
          </div>
        </div>

        <aside className="hidden xl:block">
          <div className="sticky top-24 z-10">
            <RecipeSummary
              ingredientCount={ingredientCount}
              totalWeight={totalWeight}
              variant="sticky"
            />
          </div>
        </aside>
      </div>

      <EntryFormStickyFooter
        wrapperClassName="xl:hidden"
        summary={
          <RecipeSummary
            ingredientCount={ingredientCount}
            totalWeight={totalWeight}
            variant="compact"
          />
        }
        actions={footerActions}
      />

      {footerActions ? (
        <div className="hidden justify-end gap-2 xl:flex">{footerActions}</div>
      ) : null}
    </form>
  );
}
