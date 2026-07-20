'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useFieldArray, useForm, type FieldPath } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';

import { listProductsAction } from '@/actions/products';
import { listRawMaterialsAction } from '@/actions/raw-materials';
import { getRecipeAction, listRecipesAction } from '@/actions/recipes';
import { ProductionLineItemRow } from '@/components/production/production-line-item-row';
import { ProductionMaterialPreview } from '@/components/production/production-material-preview';
import { ProductionTotalBar } from '@/components/production/production-total-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { buildMaterialPreview } from '@/lib/domain/calculations/production-materials';
import { DUPLICATE_PRODUCT_MESSAGE } from '@/lib/domain/constants/production';
import {
  productionFormSchema,
  type ProductionFormValues,
} from '@/lib/domain/schemas/production.schema';
import {
  focusFirstProductionFormError,
  focusProductionFormField,
  focusProductionLineField,
  getLocalProductionDateString,
  type ProductionFieldError,
} from '@/lib/utils/production-form-errors';
import type { Production } from '@/types/production';
import type { ProductListItem } from '@/types/product';
import type { Recipe, RecipeListItem } from '@/types/recipe';
import type { RawMaterialListItem } from '@/types/raw-material';

type ProductionFormProps = {
  production?: Production;
  onSubmit: (values: ProductionFormValues) => Promise<void>;
  isSubmitting?: boolean;
  formId: string;
  serverFieldError?: ProductionFieldError | null;
  onServerFieldErrorHandled?: () => void;
};

const defaultValues: ProductionFormValues = {
  productionDate: getLocalProductionDateString(),
  lines: [],
  notes: '',
};

function buildEligibleProducts(
  products: ProductListItem[],
  recipesById: Map<string, RecipeListItem>,
): ProductListItem[] {
  return products.filter((product) => {
    if (!product.isActive || !product.activeRecipeId) {
      return false;
    }

    const recipe = recipesById.get(product.activeRecipeId);

    return Boolean(recipe?.isActive && recipe.productId === product.id);
  });
}

export function ProductionForm({
  production,
  onSubmit,
  isSubmitting = false,
  formId,
  serverFieldError,
  onServerFieldErrorHandled,
}: ProductionFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    watch,
    reset,
    control,
    formState: { errors },
  } = useForm<ProductionFormValues>({
    resolver: zodResolver(productionFormSchema),
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lines',
  });

  const lines = watch('lines');

  const { data: productsResult, isLoading: isLoadingProducts } = useQuery({
    queryKey: ['products', 'production-picker'],
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

  const { data: recipesResult, isLoading: isLoadingRecipes } = useQuery({
    queryKey: ['recipes', 'production-picker'],
    queryFn: async () => {
      const result = await listRecipesAction({
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
    queryKey: ['raw-materials', 'production-preview'],
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

  const recipesById = useMemo(() => {
    const map = new Map<string, RecipeListItem>();

    for (const item of recipesResult?.items ?? []) {
      map.set(item.id, item);
    }

    return map;
  }, [recipesResult?.items]);

  const rawMaterialsById = useMemo(() => {
    const map = new Map<string, RawMaterialListItem>();

    for (const item of rawMaterialsResult?.items ?? []) {
      map.set(item.id, item);
    }

    return map;
  }, [rawMaterialsResult?.items]);

  const eligibleProducts = useMemo(
    () => buildEligibleProducts(productsResult?.items ?? [], recipesById),
    [productsResult?.items, recipesById],
  );

  const activeRecipeIds = useMemo(
    () =>
      [
        ...new Set(
          eligibleProducts
            .map((product) => product.activeRecipeId)
            .filter((id): id is string => Boolean(id)),
        ),
      ].sort(),
    [eligibleProducts],
  );

  const { data: fullRecipes, isLoading: isLoadingFullRecipes } = useQuery({
    queryKey: ['recipes', 'production-full', activeRecipeIds],
    enabled: activeRecipeIds.length > 0,
    queryFn: async () => {
      const results = await Promise.all(activeRecipeIds.map((id) => getRecipeAction(id)));
      const recipes: Recipe[] = [];

      for (const result of results) {
        if (result.success) {
          recipes.push(result.data);
        }
      }

      return recipes;
    },
  });

  const fullRecipesById = useMemo(() => {
    const map = new Map<string, Recipe>();

    for (const recipe of fullRecipes ?? []) {
      map.set(recipe.id, recipe);
    }

    return map;
  }, [fullRecipes]);

  const productsById = useMemo(() => {
    const map = new Map<string, ProductListItem>();

    for (const product of eligibleProducts) {
      map.set(product.id, product);
    }

    return map;
  }, [eligibleProducts]);

  const selectedProductIdsByIndex = useMemo(
    () =>
      lines.map((line, index) =>
        lines
          .filter((_, lineIndex) => lineIndex !== index)
          .map((item) => item.productId)
          .filter(Boolean),
      ),
    [lines],
  );

  const totalUnits = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const quantity = Number(line.quantity);

        if (Number.isNaN(quantity)) {
          return sum;
        }

        return sum + quantity;
      }, 0),
    [lines],
  );

  const previewLines = useMemo(
    () =>
      lines
        .filter((line) => line.productId && line.quantity > 0)
        .map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          recipeId: productsById.get(line.productId)?.activeRecipeId ?? null,
        })),
    [lines, productsById],
  );

  const materialPreviewRows = useMemo(
    () => buildMaterialPreview(previewLines, fullRecipesById, rawMaterialsById),
    [previewLines, fullRecipesById, rawMaterialsById],
  );

  const hasValidPreviewLines = previewLines.length > 0;

  useEffect(() => {
    if (production) {
      reset({
        productionDate: production.productionDate,
        lines: production.lines.map((line) => ({
          id: line.id,
          productId: line.productId,
          quantity: line.quantity,
          unit: line.unit,
        })),
        notes: production.notes ?? '',
      });
      return;
    }

    reset(defaultValues);
  }, [production, reset]);

  useEffect(() => {
    if (!serverFieldError) {
      return;
    }

    setError(serverFieldError.field as FieldPath<ProductionFormValues>, {
      message: serverFieldError.message,
    });
    focusProductionFormField(serverFieldError.field);
    onServerFieldErrorHandled?.();
  }, [serverFieldError, setError, onServerFieldErrorHandled]);

  function handleAddLine() {
    append({
      productId: '',
      quantity: Number.NaN,
      unit: '',
    });
  }

  function handleProductChange(index: number, productId: string) {
    const product = productsById.get(productId);

    if (product) {
      setValue(`lines.${index}.unit`, product.unit, { shouldValidate: true });
    }

    clearErrors(`lines.${index}.productId`);
  }

  function handleDuplicateProduct(index: number) {
    setError(`lines.${index}.productId`, {
      type: 'manual',
      message: DUPLICATE_PRODUCT_MESSAGE,
    });
    focusProductionLineField(index, 'productId');
  }

  function handleInvalidSubmit(fieldErrors: typeof errors) {
    focusFirstProductionFormError(fieldErrors);
  }

  const isLoadingPickers =
    isLoadingProducts || isLoadingRecipes || isLoadingRawMaterials || isLoadingFullRecipes;
  const isFormDisabled = isSubmitting || isLoadingPickers;

  return (
    <form
      id={formId}
      onSubmit={handleSubmit(onSubmit, handleInvalidSubmit)}
      className="space-y-6"
      noValidate
    >
      <fieldset className="space-y-4" disabled={isFormDisabled}>
        <legend className="sr-only">Production header details</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          {production ? (
            <div className="space-y-2">
              <Label htmlFor="productionNumber">Production Number</Label>
              <Input
                id="productionNumber"
                value={production.productionNumber}
                readOnly
                disabled
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="productionDate">Production Date *</Label>
            <Input
              id="productionDate"
              type="date"
              aria-invalid={Boolean(errors.productionDate)}
              aria-describedby={errors.productionDate ? 'productionDate-error' : undefined}
              {...register('productionDate')}
            />
            {errors.productionDate ? (
              <p id="productionDate-error" className="text-sm text-destructive" role="alert">
                {errors.productionDate.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={3}
              className="resize-none"
              aria-invalid={Boolean(errors.notes)}
              aria-describedby={errors.notes ? 'notes-error' : undefined}
              {...register('notes')}
            />
            {errors.notes ? (
              <p id="notes-error" className="text-sm text-destructive" role="alert">
                {errors.notes.message}
              </p>
            ) : null}
          </div>
        </div>
      </fieldset>

      <div className="space-y-4 border-t pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Product Lines</h2>
            <p className="text-sm text-muted-foreground">
              Only active products with an active recipe can be added. Each product may appear once
              per production entry.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={handleAddLine}
            disabled={isFormDisabled || eligibleProducts.length === 0}
          >
            <Plus />
            Add Product Line
          </Button>
        </div>

        {!isLoadingPickers && eligibleProducts.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            No eligible products found. Ensure products are active and have an active recipe linked.
          </div>
        ) : null}

        {errors.lines?.message ? (
          <p className="text-sm text-destructive" role="alert">
            {errors.lines.message}
          </p>
        ) : null}
        {errors.lines?.root?.message ? (
          <p className="text-sm text-destructive" role="alert">
            {errors.lines.root.message}
          </p>
        ) : null}

        {isLoadingPickers ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading products">
            {Array.from({ length: Math.max(fields.length, 1) }).map((_, index) => (
              <Skeleton key={index} className="h-36 w-full rounded-lg" />
            ))}
          </div>
        ) : fields.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            No product lines yet. Add at least one product to record this production draft.
          </div>
        ) : (
          <div className="space-y-3">
            {fields.map((field, index) => (
              <ProductionLineItemRow
                key={field.id}
                index={index}
                register={register}
                setValue={setValue}
                errors={errors}
                productId={lines[index]?.productId ?? ''}
                unit={lines[index]?.unit ?? ''}
                products={eligibleProducts}
                selectedProductIds={selectedProductIdsByIndex[index] ?? []}
                disabled={isFormDisabled}
                onRemove={() => remove(index)}
                onProductChange={(productId) => handleProductChange(index, productId)}
                onDuplicateProduct={handleDuplicateProduct}
              />
            ))}
          </div>
        )}
      </div>

      <ProductionMaterialPreview
        rows={materialPreviewRows}
        isLoading={isLoadingPickers}
        hasValidLines={hasValidPreviewLines}
      />

      <ProductionTotalBar lineCount={fields.length} totalUnits={totalUnits} />

      {isSubmitting ? (
        <p className="sr-only" aria-live="polite">
          Saving production draft...
        </p>
      ) : null}
    </form>
  );
}
