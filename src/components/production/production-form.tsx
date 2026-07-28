'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { useFieldArray, useForm, useWatch, type FieldPath } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';

import { getProductAction } from '@/actions/products';
import { useAuth } from '@/hooks/use-auth';
import { getRecipeAction, listRecipesAction } from '@/actions/recipes';
import { ProductionLineItemRow } from '@/components/production/production-line-item-row';
import { ProductionMaterialPreview } from '@/components/production/production-material-preview';
import { ProductionTotalBar } from '@/components/production/production-total-bar';
import { LineItemsGrid } from '@/components/shared/line-items-grid/line-items-grid';
import { EntryFormStickyFooter } from '@/components/shared/entry-form-sticky-footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAutoFirstLine } from '@/hooks/use-auto-first-line';
import { useProductsByIds } from '@/hooks/use-products-by-ids';
import { useRawMaterialsByIds } from '@/hooks/use-raw-materials-by-ids';
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
import {
  PRODUCTION_GRID_MIN_WIDTH,
  PRODUCTION_GRID_ROW_CLASS,
  PRODUCTION_LINE_COLUMNS,
} from '@/lib/ui/line-items-grid-config';
import { toProductListItem } from '@/lib/utils/catalog-list-item';
import type { Production } from '@/types/production';
import type { ProductListItem } from '@/types/product';
import type { Recipe, RecipeListItem } from '@/types/recipe';

type ProductionFormProps = {
  production?: Production;
  initialLines?: ProductionFormValues['lines'];
  onSubmit: (values: ProductionFormValues) => Promise<void>;
  isSubmitting?: boolean;
  formId: string;
  serverFieldError?: ProductionFieldError | null;
  onServerFieldErrorHandled?: () => void;
  footerActions?: ReactNode;
};

const defaultValues: ProductionFormValues = {
  productionDate: getLocalProductionDateString(),
  lines: [],
  notes: '',
};

function isEligibleProduct(
  product: ProductListItem,
  recipesById: Map<string, RecipeListItem>,
): boolean {
  if (!product.isActive || !product.activeRecipeId) {
    return false;
  }

  const recipe = recipesById.get(product.activeRecipeId);

  return Boolean(recipe?.isActive && recipe.productId === product.id);
}

export function ProductionForm({
  production,
  initialLines,
  onSubmit,
  isSubmitting = false,
  formId,
  serverFieldError,
  onServerFieldErrorHandled,
  footerActions,
}: ProductionFormProps) {
  const { isAuthenticated } = useAuth();
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
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

  const lines = useWatch({ control, name: 'lines', defaultValue: defaultValues.lines }) ?? [];

  const appendEmptyLine = useCallback(() => {
    append({
      productId: '',
      quantity: Number.NaN,
      unit: '',
    });
  }, [append]);

  const {
    data: recipesResult,
    isLoading: isLoadingRecipes,
  } = useQuery({
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
    enabled: isAuthenticated,
  });

  const selectedProductIds = useMemo(
    () => lines.map((line) => line.productId).filter(Boolean),
    [lines],
  );

  const { productsById, isLoading: isLoadingSelectedProducts } =
    useProductsByIds(selectedProductIds);

  const recipesById = useMemo(() => {
    const map = new Map<string, RecipeListItem>();

    for (const item of recipesResult?.items ?? []) {
      map.set(item.id, item);
    }

    return map;
  }, [recipesResult?.items]);

  const filterEligibleProduct = useCallback(
    (product: ProductListItem) => isEligibleProduct(product, recipesById),
    [recipesById],
  );

  const activeRecipeIds = useMemo(() => {
    const ids = new Set<string>();

    for (const line of lines) {
      if (!line.productId) {
        continue;
      }

      const product = productsById.get(line.productId);

      if (product?.activeRecipeId) {
        ids.add(product.activeRecipeId);
      }
    }

    return [...ids].sort();
  }, [lines, productsById]);

  const { data: fullRecipes, isLoading: isLoadingFullRecipes } = useQuery({
    queryKey: ['recipes', 'production-full', activeRecipeIds],
    enabled: isAuthenticated && activeRecipeIds.length > 0,
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

  const previewMaterialIds = useMemo(() => {
    const ids = new Set<string>();

    for (const recipe of fullRecipes ?? []) {
      for (const ingredient of recipe.ingredients) {
        ids.add(ingredient.rawMaterialId);
      }
    }

    return [...ids];
  }, [fullRecipes]);

  const { rawMaterialsById, isLoading: isLoadingPreviewMaterials } =
    useRawMaterialsByIds(previewMaterialIds);

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

    if (initialLines && initialLines.length > 0) {
      reset({
        ...defaultValues,
        lines: initialLines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unit: line.unit,
        })),
      });
      return;
    }

    reset(defaultValues);
  }, [production, initialLines, reset]);

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
    appendEmptyLine();
  }

  function handleProductChange(index: number, productId: string) {
    void (async () => {
      let product = productsById.get(productId);

      if (!product) {
        const result = await getProductAction(productId);

        if (result.success) {
          product = toProductListItem(result.data);
        }
      }

      if (product) {
        setValue(`lines.${index}.unit`, product.unit, { shouldValidate: true });
      }
    })();

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
    isLoadingRecipes ||
    isLoadingSelectedProducts ||
    isLoadingFullRecipes ||
    isLoadingPreviewMaterials;
  const isFormDisabled = isSubmitting || isLoadingPickers;

  useAutoFirstLine(
    Boolean(production) || Boolean(initialLines?.length),
    fields.length,
    !isLoadingRecipes,
    appendEmptyLine,
  );

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

      <div className="space-y-3 border-t pt-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-0.5">
            <h2 className="text-base font-semibold">Product Lines</h2>
            <p className="text-sm text-muted-foreground">
              Active products with an active recipe only. Each product may appear once per entry.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={handleAddLine}
            disabled={isFormDisabled}
          >
            <Plus />
            Add Product Line
          </Button>
        </div>

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

        {fields.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            No product lines yet. Add at least one product to record this production draft.
          </div>
        ) : (
          <LineItemsGrid
            columns={PRODUCTION_LINE_COLUMNS}
            rowClassName={PRODUCTION_GRID_ROW_CLASS}
            minWidthClassName={PRODUCTION_GRID_MIN_WIDTH}
          >
            {fields.map((field, index) => {
              const product = productsById.get(lines[index]?.productId ?? '');

              return (
                <ProductionLineItemRow
                  key={field.id}
                  index={index}
                  control={control}
                  register={register}
                  setValue={setValue}
                  errors={errors}
                  productId={lines[index]?.productId ?? ''}
                  unit={lines[index]?.unit ?? ''}
                  selectedProduct={product ?? null}
                  selectedProductIds={selectedProductIdsByIndex[index] ?? []}
                  filterProduct={filterEligibleProduct}
                  disabled={isFormDisabled}
                  onRemove={() => remove(index)}
                  onProductChange={(productId) => handleProductChange(index, productId)}
                  onDuplicateProduct={handleDuplicateProduct}
                  onAdvanceToNextLine={() => {
                    const nextIndex = index + 1;
                    const didAppend = nextIndex >= fields.length;

                    if (didAppend) {
                      appendEmptyLine();
                      window.requestAnimationFrame(() => {
                        window.requestAnimationFrame(() => {
                          focusProductionLineField(nextIndex, 'productId');
                        });
                      });
                      return;
                    }

                    focusProductionLineField(nextIndex, 'productId');
                  }}
                />
              );
            })}
          </LineItemsGrid>
        )}
      </div>

      <ProductionMaterialPreview
        rows={materialPreviewRows}
        isLoading={isLoadingPickers}
        hasValidLines={hasValidPreviewLines}
      />

      <EntryFormStickyFooter
        summary={
          <ProductionTotalBar
            lineCount={fields.length}
            totalUnits={totalUnits}
            variant="compact"
          />
        }
        actions={footerActions}
      />

      {isSubmitting ? (
        <p className="sr-only" aria-live="polite">
          Saving production draft...
        </p>
      ) : null}
    </form>
  );
}
