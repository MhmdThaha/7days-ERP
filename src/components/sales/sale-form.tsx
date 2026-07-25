'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm, type FieldPath } from 'react-hook-form';

import { getProductAction } from '@/actions/products';
import { SaleLineItemRow } from '@/components/sales/sale-line-item-row';
import { SaleTotalBar } from '@/components/sales/sale-total-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAutoFirstLine } from '@/hooks/use-auto-first-line';
import { useProductsByIds } from '@/hooks/use-products-by-ids';
import { DUPLICATE_PRODUCT_MESSAGE } from '@/lib/domain/constants/sale';
import { saleFormSchema, type SaleFormValues } from '@/lib/domain/schemas/sale.schema';
import { getRecentCustomers } from '@/lib/utils/form-recent-values';
import {
  focusFirstSaleFormError,
  focusSaleFormField,
  focusSaleLineField,
  getLocalSaleDateString,
  type SaleFieldError,
} from '@/lib/utils/sale-form-errors';
import { toProductListItem } from '@/lib/utils/catalog-list-item';
import type { Sale } from '@/types/sale';

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

  const [recentCustomers, setRecentCustomers] = useState<string[]>([]);

  const lines = watch('lines');

  const appendEmptyLine = useCallback(() => {
    append({
      productId: '',
      quantity: Number.NaN,
      sellingPrice: 0,
    });
  }, [append]);

  const selectedProductIds = useMemo(
    () => lines.map((line) => line.productId).filter(Boolean),
    [lines],
  );

  const { productsById, isLoading: isLoadingSelectedProducts } =
    useProductsByIds(selectedProductIds);

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
    setRecentCustomers(getRecentCustomers());
  }, []);

  useAutoFirstLine(Boolean(sale), fields.length, true, appendEmptyLine);

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
    appendEmptyLine();
  }

  async function handleProductChange(index: number, productId: string) {
    let product = productsById.get(productId);

    if (!product) {
      const result = await getProductAction(productId);

      if (result.success) {
        product = toProductListItem(result.data);
      }
    }

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

  const isFormDisabled = isSubmitting || (Boolean(sale) && isLoadingSelectedProducts);

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
              list="sale-customer-suggestions"
              placeholder="Optional — e.g. Corner Shop, Walk-in"
              aria-invalid={Boolean(errors.customerName)}
              aria-describedby={
                errors.customerName ? 'customerName-error' : 'customerName-hint'
              }
              {...register('customerName')}
            />
            <datalist id="sale-customer-suggestions">
              {recentCustomers.map((customer) => (
                <option key={customer} value={customer} />
              ))}
            </datalist>
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
              changed for this sale only. Product stock is updated when you complete the sale.
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

        {fields.length === 0 ? (
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
                  selectedProduct={product ?? null}
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
