'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useFieldArray, useForm, useWatch, type FieldPath } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';

import { getProductAction } from '@/actions/products';
import { SaleDetailSummary } from '@/components/sales/sale-detail-summary';
import { SaleLineItemRow } from '@/components/sales/sale-line-item-row';
import { SaleTotalBar } from '@/components/sales/sale-total-bar';
import { LineItemsGrid } from '@/components/shared/line-items-grid/line-items-grid';
import { EntryFormStickyFooter } from '@/components/shared/entry-form-sticky-footer';
import {
  SALE_GRID_MIN_WIDTH,
  SALE_GRID_ROW_CLASS,
  SALE_LINE_COLUMNS,
} from '@/lib/ui/line-items-grid-config';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useProductsByIds } from '@/hooks/use-products-by-ids';
import { useAuth } from '@/hooks/use-auth';
import { debugLog, debugNavType } from '@/lib/debug/sprint-debug';
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
import type { ProductListItem } from '@/types/product';

type SaleFormProps = {
  sale?: Sale;
  onSubmit: (values: SaleFormValues) => Promise<void>;
  isSubmitting?: boolean;
  formId: string;
  serverFieldError?: SaleFieldError | null;
  onServerFieldErrorHandled?: () => void;
  footerActions?: ReactNode;
};

const defaultValues: SaleFormValues = {
  saleDate: getLocalSaleDateString(),
  customerName: '',
  // The first empty row lives in defaultValues (not an effect) so that
  // reset(defaultValues) always restores it, regardless of effect ordering
  // or StrictMode double-invocation. See Sprint 2 root cause #1.
  lines: [{ productId: '', quantity: Number.NaN, sellingPrice: 0 }],
  notes: '',
};

function formatSaleDateLabel(date: string): string {
  const [year, month, day] = date.split('-');

  if (!year || !month || !day) {
    return date;
  }

  return `${day}/${month}/${year}`;
}

export function SaleForm({
  sale,
  onSubmit,
  isSubmitting = false,
  formId,
  serverFieldError,
  onServerFieldErrorHandled,
  footerActions,
}: SaleFormProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
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
  const [selectedProductsById, setSelectedProductsById] = useState<
    Map<string, ProductListItem>
  >(() => new Map());

  const lines = useWatch({ control, name: 'lines', defaultValue: defaultValues.lines }) ?? [];
  const saleDate =
    useWatch({ control, name: 'saleDate', defaultValue: defaultValues.saleDate }) ??
    defaultValues.saleDate;
  const customerName =
    useWatch({ control, name: 'customerName', defaultValue: defaultValues.customerName }) ??
    defaultValues.customerName;

  useEffect(() => {
    debugLog('SaleForm', 'MOUNTED', { navType: debugNavType(), isEditMode: Boolean(sale) });

    return () => debugLog('SaleForm', 'UNMOUNTED', {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const appendEmptyLine = useCallback(() => {
    debugLog('SaleForm', 'appendEmptyLine()', {
      fieldsLengthBefore: fields.length,
      fieldIdsBefore: fields.map((field) => field.id),
    });

    append({
      productId: '',
      quantity: Number.NaN,
      sellingPrice: 0,
    });
  }, [append, fields.length]);

  useEffect(() => {
    debugLog('SaleForm', 'fields.length', {
      fieldsLength: fields.length,
      linesLength: lines?.length ?? null,
      fieldIds: fields.map((field) => field.id),
    });
  }, [fields, fields.length, lines?.length]);

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

  debugLog('SaleForm', 'RENDER', {
    fieldsLength: fields.length,
    isEditMode: Boolean(sale),
  });

  useEffect(() => {
    debugLog('SaleForm', 'reset() effect fired', {
      isEditMode: Boolean(sale),
      resetTarget: sale ? 'sale values' : 'defaultValues (lines: [1 empty row])',
      fieldsLengthAtEffectCreation: fields.length,
    });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const resolvedProduct = selectedProductsById.get(productId) ?? productsById.get(productId);
    let product = resolvedProduct;

    if (!product) {
      const result = await getProductAction(productId);

      if (result.success) {
        product = toProductListItem(result.data);

        if (user?.uid) {
          queryClient.setQueryData(['product', user.uid, productId], product);
        }

        setSelectedProductsById((current) => {
          const next = new Map(current);
          next.set(productId, product!);
          return next;
        });
      }
    }

    if (product) {
      setValue(`lines.${index}.sellingPrice`, product.sellingPrice, { shouldValidate: true });
    }

    clearErrors(`lines.${index}.productId`);
  }

  function handleProductResolved(product: ProductListItem) {
    setSelectedProductsById((current) => {
      const next = new Map(current);
      next.set(product.id, product);
      return next;
    });
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
      className="space-y-8"
      noValidate
    >
      <Card>
        <CardHeader>
          <CardTitle>Sale details</CardTitle>
        </CardHeader>
        <CardContent>
          <fieldset className="space-y-4" disabled={isFormDisabled}>
            <legend className="sr-only">Sale header details</legend>

            <div className="grid gap-4 sm:grid-cols-2">
              {sale ? (
                <div className="space-y-2">
                  <Label htmlFor="saleNumber">Sale number</Label>
                  <Input
                    id="saleNumber"
                    value={sale.saleNumber}
                    readOnly
                    disabled
                    className="text-base"
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="saleDate">Sale date *</Label>
                <Input
                  id="saleDate"
                  type="date"
                  className="min-h-11 text-base"
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
                <Label htmlFor="customerName">Customer name</Label>
                <Input
                  id="customerName"
                  list="sale-customer-suggestions"
                  className="text-base"
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
                  className="resize-none text-base"
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
        </CardContent>
      </Card>

      <SaleDetailSummary
        saleDateLabel={formatSaleDateLabel(saleDate)}
        customerLabel={(customerName ?? '').trim() || 'Walk-in'}
        subtotal={subtotal}
        productLineCount={fields.length}
        isDraft
      />

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Product lines</CardTitle>
            <CardDescription>
              Add each product once. Price defaults from the product master.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={handleAddLine}
            disabled={isFormDisabled}
          >
            <Plus />
            Add product
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
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
            <LineItemsGrid
              columns={SALE_LINE_COLUMNS}
              rowClassName={SALE_GRID_ROW_CLASS}
              minWidthClassName={SALE_GRID_MIN_WIDTH}
              className="overflow-y-visible"
            >
              {fields.map((field, index) => {
                const lineProductId = lines[index]?.productId ?? '';
                const product =
                  selectedProductsById.get(lineProductId) ?? productsById.get(lineProductId);
                const isLoadingLineProduct =
                  Boolean(lineProductId) && !product && isLoadingSelectedProducts;

                return (
                  <SaleLineItemRow
                    key={field.id}
                    fieldId={field.id}
                    index={index}
                    control={control}
                    register={register}
                    setValue={setValue}
                    errors={errors}
                    productId={lineProductId}
                    unit={product?.unit ?? '—'}
                    sellingPrice={lines[index]?.sellingPrice ?? 0}
                    quantity={lines[index]?.quantity ?? 0}
                    selectedProduct={product ?? null}
                    isLoadingProduct={isLoadingLineProduct}
                    selectedProductIds={selectedProductIdsByIndex[index] ?? []}
                    disabled={isFormDisabled}
                    onRemove={() => remove(index)}
                    onProductChange={(productId) => handleProductChange(index, productId)}
                    onProductResolved={handleProductResolved}
                    onDuplicateProduct={handleDuplicateProduct}
                    onSellingPriceChange={(sellingPrice) =>
                      setValue(`lines.${index}.sellingPrice`, sellingPrice)
                    }
                    onAdvanceToNextLine={() => {
                      const nextIndex = index + 1;
                      const didAppend = nextIndex >= fields.length;

                      if (didAppend) {
                        appendEmptyLine();
                        window.requestAnimationFrame(() => {
                          window.requestAnimationFrame(() => {
                            focusSaleLineField(nextIndex, 'productId');
                          });
                        });
                        return;
                      }

                      focusSaleLineField(nextIndex, 'productId');
                    }}
                  />
                );
              })}
            </LineItemsGrid>
          )}
        </CardContent>
      </Card>

      <EntryFormStickyFooter
        summary={<SaleTotalBar lineCount={fields.length} subtotal={subtotal} variant="compact" />}
        actions={footerActions}
      />

      {isSubmitting ? (
        <p className="sr-only" aria-live="polite">
          Saving sale...
        </p>
      ) : null}
    </form>
  );
}
