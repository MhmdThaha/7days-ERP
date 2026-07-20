'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useFieldArray, useForm, type FieldPath } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';

import { listProductsAction } from '@/actions/products';
import { WastageLineItemRow } from '@/components/wastage/wastage-line-item-row';
import { WastageTotalBar } from '@/components/wastage/wastage-total-bar';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  DUPLICATE_PRODUCT_MESSAGE,
  WASTAGE_REASONS,
  WASTAGE_REASON_LABELS,
} from '@/lib/domain/constants/wastage';
import { wastageFormSchema, type WastageFormValues } from '@/lib/domain/schemas/wastage.schema';
import {
  focusFirstWastageFormError,
  focusWastageFormField,
  focusWastageLineField,
  getLocalWastageDateString,
  type WastageFieldError,
} from '@/lib/utils/wastage-form-errors';
import {
  getWastageLineStockErrors,
  hasWastageLinesStockErrors,
} from '@/lib/utils/wastage-stock-validation';
import type { Wastage } from '@/types/wastage';
import type { ProductListItem } from '@/types/product';

type WastageFormProps = {
  wastage?: Wastage;
  onSubmit: (values: WastageFormValues) => Promise<void>;
  isSubmitting?: boolean;
  formId: string;
  serverFieldError?: WastageFieldError | null;
  onServerFieldErrorHandled?: () => void;
  onStockValidationChange?: (hasErrors: boolean) => void;
};

const defaultValues: WastageFormValues = {
  wastageDate: getLocalWastageDateString(),
  reason: 'damaged',
  lines: [],
  notes: '',
};

const reasonSelectItems = WASTAGE_REASONS.map((reason) => ({
  value: reason,
  label: WASTAGE_REASON_LABELS[reason],
}));

export function WastageForm({
  wastage,
  onSubmit,
  isSubmitting = false,
  formId,
  serverFieldError,
  onServerFieldErrorHandled,
  onStockValidationChange,
}: WastageFormProps) {
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
  } = useForm<WastageFormValues>({
    resolver: zodResolver(wastageFormSchema),
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lines',
  });

  const lines = watch('lines');
  const reason = watch('reason');

  const { data: productsResult, isLoading: isLoadingProducts } = useQuery({
    queryKey: ['products', 'wastage-picker'],
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

  const products = productsResult?.items ?? [];

  const productsById = useMemo(() => {
    const map = new Map<string, ProductListItem>();

    for (const product of products) {
      map.set(product.id, product);
    }

    return map;
  }, [products]);

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

  const lineStockErrors = useMemo(
    () => getWastageLineStockErrors(lines, productsById),
    [lines, productsById],
  );

  const hasStockErrors = useMemo(
    () => hasWastageLinesStockErrors(lines, productsById),
    [lines, productsById],
  );

  useEffect(() => {
    onStockValidationChange?.(hasStockErrors || isLoadingProducts);
  }, [hasStockErrors, isLoadingProducts, onStockValidationChange]);

  useEffect(() => {
    if (wastage) {
      reset({
        wastageDate: wastage.wastageDate,
        reason: wastage.reason,
        lines: wastage.lines.map((line) => ({
          id: line.id,
          productId: line.productId,
          quantity: line.quantity,
        })),
        notes: wastage.notes ?? '',
      });
      return;
    }

    reset(defaultValues);
  }, [wastage, reset]);

  useEffect(() => {
    if (!serverFieldError) {
      return;
    }

    setError(serverFieldError.field as FieldPath<WastageFormValues>, {
      message: serverFieldError.message,
    });
    focusWastageFormField(serverFieldError.field);
    onServerFieldErrorHandled?.();
  }, [serverFieldError, setError, onServerFieldErrorHandled]);

  function handleAddLine() {
    append({
      productId: '',
      quantity: Number.NaN,
    });
  }

  function handleProductChange(index: number, productId: string) {
    void productId;
    clearErrors(`lines.${index}.productId`);
  }

  function handleDuplicateProduct(index: number) {
    setError(`lines.${index}.productId`, {
      type: 'manual',
      message: DUPLICATE_PRODUCT_MESSAGE,
    });
    focusWastageLineField(index, 'productId');
  }

  function handleInvalidSubmit(fieldErrors: typeof errors) {
    focusFirstWastageFormError(fieldErrors);
  }

  const isFormDisabled = isSubmitting || isLoadingProducts;

  return (
    <form
      id={formId}
      onSubmit={handleSubmit(onSubmit, handleInvalidSubmit)}
      className="space-y-6"
      noValidate
    >
      <fieldset className="space-y-4" disabled={isFormDisabled}>
        <legend className="sr-only">Wastage header details</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          {wastage ? (
            <div className="space-y-2">
              <Label htmlFor="wastageNumber">Wastage Number</Label>
              <Input id="wastageNumber" value={wastage.wastageNumber} readOnly disabled />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="wastageDate">Wastage Date *</Label>
            <Input
              id="wastageDate"
              type="date"
              aria-invalid={Boolean(errors.wastageDate)}
              aria-describedby={errors.wastageDate ? 'wastageDate-error' : undefined}
              {...register('wastageDate')}
            />
            {errors.wastageDate ? (
              <p id="wastageDate-error" className="text-sm text-destructive" role="alert">
                {errors.wastageDate.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason *</Label>
            <Select
              value={reason}
              items={reasonSelectItems}
              onValueChange={(value) => {
                if (value) {
                  setValue('reason', value, { shouldValidate: true });
                }
              }}
              disabled={isFormDisabled}
            >
              <SelectTrigger
                id="reason"
                className="w-full"
                aria-invalid={Boolean(errors.reason)}
                aria-describedby={errors.reason ? 'reason-error' : undefined}
              >
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                {WASTAGE_REASONS.map((option) => (
                  <SelectItem
                    key={option}
                    value={option}
                    label={WASTAGE_REASON_LABELS[option]}
                  >
                    {WASTAGE_REASON_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.reason ? (
              <p id="reason-error" className="text-sm text-destructive" role="alert">
                {errors.reason.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={3}
              className="resize-none"
              placeholder="Optional — e.g. batch details, shift notes"
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
              Add each product once. Product name and code are saved as snapshots. Inventory is not
              updated until wastage is completed in a later phase.
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
            Add Product
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

        {isLoadingProducts ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading products">
            {Array.from({ length: Math.max(fields.length, 1) }).map((_, index) => (
              <Skeleton key={index} className="h-40 w-full rounded-lg" />
            ))}
          </div>
        ) : fields.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            No products yet. Add at least one product to record this wastage.
          </div>
        ) : (
          <div className="space-y-3">
            {fields.map((field, index) => {
              const product = productsById.get(lines[index]?.productId ?? '');

              return (
                <WastageLineItemRow
                  key={field.id}
                  index={index}
                  register={register}
                  setValue={setValue}
                  errors={errors}
                  productId={lines[index]?.productId ?? ''}
                  unit={product?.unit ?? '—'}
                  availableStock={product ? product.currentStock : null}
                  stockErrorMessage={lineStockErrors[index] ?? null}
                  products={products}
                  selectedProductIds={selectedProductIdsByIndex[index] ?? []}
                  disabled={isFormDisabled}
                  onRemove={() => remove(index)}
                  onProductChange={(productId) => handleProductChange(index, productId)}
                  onDuplicateProduct={handleDuplicateProduct}
                />
              );
            })}
          </div>
        )}
      </div>

      <WastageTotalBar lineCount={fields.length} totalUnits={totalUnits} />

      {isSubmitting ? (
        <p className="sr-only" aria-live="polite">
          Saving wastage...
        </p>
      ) : null}
    </form>
  );
}
