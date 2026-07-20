'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useFieldArray, useForm, type FieldPath } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';

import { listProductsAction } from '@/actions/products';
import { ReturnLineItemRow } from '@/components/returns/return-line-item-row';
import { ReturnTotalBar } from '@/components/returns/return-total-bar';
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
  RETURN_REASONS,
  RETURN_REASON_LABELS,
} from '@/lib/domain/constants/return';
import { returnFormSchema, type ReturnFormValues } from '@/lib/domain/schemas/return.schema';
import {
  focusFirstReturnFormError,
  focusReturnFormField,
  focusReturnLineField,
  getLocalReturnDateString,
  type ReturnFieldError,
} from '@/lib/utils/return-form-errors';
import type { ReturnEntry } from '@/types/return';
import type { ProductListItem } from '@/types/product';

type ReturnFormProps = {
  returnEntry?: ReturnEntry;
  onSubmit: (values: ReturnFormValues) => Promise<void>;
  isSubmitting?: boolean;
  formId: string;
  serverFieldError?: ReturnFieldError | null;
  onServerFieldErrorHandled?: () => void;
};

const defaultValues: ReturnFormValues = {
  returnDate: getLocalReturnDateString(),
  reason: 'damaged',
  lines: [],
  notes: '',
};

const reasonSelectItems = RETURN_REASONS.map((reason) => ({
  value: reason,
  label: RETURN_REASON_LABELS[reason],
}));

export function ReturnForm({
  returnEntry,
  onSubmit,
  isSubmitting = false,
  formId,
  serverFieldError,
  onServerFieldErrorHandled,
}: ReturnFormProps) {
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
  } = useForm<ReturnFormValues>({
    resolver: zodResolver(returnFormSchema),
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lines',
  });

  const lines = watch('lines');
  const reason = watch('reason');

  const { data: productsResult, isLoading: isLoadingProducts } = useQuery({
    queryKey: ['products', 'return-picker'],
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

  useEffect(() => {
    if (returnEntry) {
      reset({
        returnDate: returnEntry.returnDate,
        reason: returnEntry.reason,
        lines: returnEntry.lines.map((line) => ({
          id: line.id,
          productId: line.productId,
          quantity: line.quantity,
        })),
        notes: returnEntry.notes ?? '',
      });
      return;
    }

    reset(defaultValues);
  }, [returnEntry, reset]);

  useEffect(() => {
    if (!serverFieldError) {
      return;
    }

    setError(serverFieldError.field as FieldPath<ReturnFormValues>, {
      message: serverFieldError.message,
    });
    focusReturnFormField(serverFieldError.field);
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
    focusReturnLineField(index, 'productId');
  }

  function handleInvalidSubmit(fieldErrors: typeof errors) {
    focusFirstReturnFormError(fieldErrors);
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
        <legend className="sr-only">Return header details</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          {returnEntry ? (
            <div className="space-y-2">
              <Label htmlFor="returnNumber">Return Number</Label>
              <Input id="returnNumber" value={returnEntry.returnNumber} readOnly disabled />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="returnDate">Return Date *</Label>
            <Input
              id="returnDate"
              type="date"
              aria-invalid={Boolean(errors.returnDate)}
              aria-describedby={errors.returnDate ? 'returnDate-error' : undefined}
              {...register('returnDate')}
            />
            {errors.returnDate ? (
              <p id="returnDate-error" className="text-sm text-destructive" role="alert">
                {errors.returnDate.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Return Reason *</Label>
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
                {RETURN_REASONS.map((option) => (
                  <SelectItem
                    key={option}
                    value={option}
                    label={RETURN_REASON_LABELS[option]}
                  >
                    {RETURN_REASON_LABELS[option]}
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
              placeholder="Optional — e.g. shop name, delivery reference"
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
              updated until the return is completed in a later phase.
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
            No products yet. Add at least one product to record this return.
          </div>
        ) : (
          <div className="space-y-3">
            {fields.map((field, index) => {
              const product = productsById.get(lines[index]?.productId ?? '');

              return (
                <ReturnLineItemRow
                  key={field.id}
                  index={index}
                  register={register}
                  setValue={setValue}
                  errors={errors}
                  productId={lines[index]?.productId ?? ''}
                  unit={product?.unit ?? '—'}
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

      <ReturnTotalBar lineCount={fields.length} totalUnits={totalUnits} />

      {isSubmitting ? (
        <p className="sr-only" aria-live="polite">
          Saving return...
        </p>
      ) : null}
    </form>
  );
}
