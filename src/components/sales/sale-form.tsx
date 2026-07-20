'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useFieldArray, useForm, type FieldPath } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';

import { listProductsAction } from '@/actions/products';
import { SaleLineItemRow } from '@/components/sales/sale-line-item-row';
import { SaleTotalBar } from '@/components/sales/sale-total-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { DUPLICATE_PRODUCT_MESSAGE } from '@/lib/domain/constants/sale';
import { saleFormSchema, type SaleFormValues } from '@/lib/domain/schemas/sale.schema';
import {
  focusFirstSaleFormError,
  focusSaleFormField,
  focusSaleLineField,
  getLocalSaleDateString,
  type SaleFieldError,
} from '@/lib/utils/sale-form-errors';
import type { Sale } from '@/types/sale';
import type { ProductListItem } from '@/types/product';

type SaleFormProps = {
  sale?: Sale;
  onSubmit: (values: SaleFormValues) => Promise<void>;
  isSubmitting?: boolean;
  formId: string;
  serverFieldError?: SaleFieldError | null;
  onServerFieldErrorHandled?: () => void;
};

const defaultValues: SaleFormValues = {
  saleDate: getLocalSaleDateString(),
  customerName: '',
  lines: [],
  notes: '',
};

export function SaleForm({
  sale,
  onSubmit,
  isSubmitting = false,
  formId,
  serverFieldError,
  onServerFieldErrorHandled,
}: SaleFormProps) {
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
  } = useForm<SaleFormValues>({
    resolver: zodResolver(saleFormSchema),
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lines',
  });

  const lines = watch('lines');

  const { data: productsResult, isLoading: isLoadingProducts } = useQuery({
    queryKey: ['products', 'sale-picker'],
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

  const subtotal = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const quantity = Number(line.quantity);
        const sellingPrice = Number(line.sellingPrice);

        if (Number.isNaN(quantity) || Number.isNaN(sellingPrice)) {
          return sum;
        }

        return sum + Math.round(quantity * sellingPrice);
      }, 0),
    [lines],
  );

  useEffect(() => {
    if (sale) {
      reset({
        saleDate: sale.saleDate,
        customerName: sale.customerNameSnapshot ?? '',
        lines: sale.lines.map((line) => ({
          id: line.id,
          productId: line.productId,
          quantity: line.quantity,
          sellingPrice: line.sellingPriceSnapshot,
        })),
        notes: sale.notes ?? '',
      });
      return;
    }

    reset(defaultValues);
  }, [sale, reset]);

  useEffect(() => {
    if (!serverFieldError) {
      return;
    }

    setError(serverFieldError.field as FieldPath<SaleFormValues>, {
      message: serverFieldError.message,
    });
    focusSaleFormField(serverFieldError.field);
    onServerFieldErrorHandled?.();
  }, [serverFieldError, setError, onServerFieldErrorHandled]);

  function handleAddLine() {
    append({
      productId: '',
      quantity: Number.NaN,
      sellingPrice: 0,
    });
  }

  function handleProductChange(index: number, productId: string) {
    const product = productsById.get(productId);

    if (product) {
      setValue(`lines.${index}.sellingPrice`, product.sellingPrice, { shouldValidate: true });
    }

    clearErrors(`lines.${index}.productId`);
  }

  function handleDuplicateProduct(index: number) {
    setError(`lines.${index}.productId`, {
      type: 'manual',
      message: DUPLICATE_PRODUCT_MESSAGE,
    });
    focusSaleLineField(index, 'productId');
  }

  function handleInvalidSubmit(fieldErrors: typeof errors) {
    focusFirstSaleFormError(fieldErrors);
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
        <legend className="sr-only">Sale header details</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          {sale ? (
            <div className="space-y-2">
              <Label htmlFor="saleNumber">Sale Number</Label>
              <Input id="saleNumber" value={sale.saleNumber} readOnly disabled />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="saleDate">Sale Date *</Label>
            <Input
              id="saleDate"
              type="date"
              aria-invalid={Boolean(errors.saleDate)}
              aria-describedby={errors.saleDate ? 'saleDate-error' : undefined}
              {...register('saleDate')}
            />
            {errors.saleDate ? (
              <p id="saleDate-error" className="text-sm text-destructive" role="alert">
                {errors.saleDate.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="customerName">Customer Name</Label>
            <Input
              id="customerName"
              placeholder="Optional — e.g. Corner Shop, Walk-in"
              aria-invalid={Boolean(errors.customerName)}
              aria-describedby={
                errors.customerName ? 'customerName-error' : 'customerName-hint'
              }
              {...register('customerName')}
            />
            {errors.customerName ? (
              <p id="customerName-error" className="text-sm text-destructive" role="alert">
                {errors.customerName.message}
              </p>
            ) : (
              <p id="customerName-hint" className="text-sm text-muted-foreground">
                Optional. Leave blank for walk-in or unnamed retail sales.
              </p>
            )}
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
              Add each product once. Selling price defaults from the product master but can be
              changed for this sale only. Inventory is not updated until the sale is completed in a
              later phase.
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
            No products yet. Add at least one product to record this sale.
          </div>
        ) : (
          <div className="space-y-3">
            {fields.map((field, index) => {
              const product = productsById.get(lines[index]?.productId ?? '');

              return (
                <SaleLineItemRow
                  key={field.id}
                  index={index}
                  register={register}
                  setValue={setValue}
                  errors={errors}
                  productId={lines[index]?.productId ?? ''}
                  unit={product?.unit ?? '—'}
                  sellingPrice={lines[index]?.sellingPrice ?? 0}
                  quantity={lines[index]?.quantity ?? 0}
                  products={products}
                  selectedProductIds={selectedProductIdsByIndex[index] ?? []}
                  disabled={isFormDisabled}
                  onRemove={() => remove(index)}
                  onProductChange={(productId) => handleProductChange(index, productId)}
                  onDuplicateProduct={handleDuplicateProduct}
                  onSellingPriceChange={(sellingPrice) =>
                    setValue(`lines.${index}.sellingPrice`, sellingPrice)
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      <SaleTotalBar lineCount={fields.length} subtotal={subtotal} />

      {isSubmitting ? (
        <p className="sr-only" aria-live="polite">
          Saving sale...
        </p>
      ) : null}
    </form>
  );
}
