'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useFieldArray, useForm, type FieldPath } from 'react-hook-form';

import { getRawMaterialAction } from '@/actions/raw-materials';
import { PurchaseDetailSummary } from '@/components/purchases/purchase-detail-summary';
import { PurchaseLineItemRow } from '@/components/purchases/purchase-line-item-row';
import { PurchaseTotalBar } from '@/components/purchases/purchase-total-bar';
import { LineItemsGrid } from '@/components/shared/line-items-grid/line-items-grid';
import { EntryFormStickyFooter } from '@/components/shared/entry-form-sticky-footer';
import {
  PURCHASE_GRID_MIN_WIDTH,
  PURCHASE_GRID_ROW_CLASS,
  PURCHASE_LINE_COLUMNS,
} from '@/lib/ui/line-items-grid-config';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAutoFirstLine } from '@/hooks/use-auto-first-line';
import { useRawMaterialsByIds } from '@/hooks/use-raw-materials-by-ids';
import { DUPLICATE_RAW_MATERIAL_MESSAGE } from '@/lib/domain/constants/purchase';
import {
  purchaseFormSchema,
  type PurchaseFormValues,
} from '@/lib/domain/schemas/purchase.schema';
import { getRecentSuppliers } from '@/lib/utils/form-recent-values';
import {
  focusFirstPurchaseFormError,
  focusPurchaseFormField,
  focusPurchaseLineItemField,
  getLocalDateString,
  type PurchaseFieldError,
} from '@/lib/utils/purchase-form-errors';
import { toRawMaterialListItem } from '@/lib/utils/catalog-list-item';
import type { Purchase } from '@/types/purchase';

type PurchaseFormProps = {
  purchase?: Purchase;
  onSubmit: (values: PurchaseFormValues) => Promise<void>;
  isSubmitting?: boolean;
  formId: string;
  serverFieldError?: PurchaseFieldError | null;
  onServerFieldErrorHandled?: () => void;
  footerActions?: ReactNode;
};

const defaultValues: PurchaseFormValues = {
  purchaseDate: getLocalDateString(),
  supplierName: '',
  invoiceNumber: '',
  paymentStatus: 'paid',
  lineItems: [],
  notes: '',
};

function formatPurchaseDateLabel(date: string): string {
  const [year, month, day] = date.split('-');

  if (!year || !month || !day) {
    return date;
  }

  return `${day}/${month}/${year}`;
}

export function PurchaseForm({
  purchase,
  onSubmit,
  isSubmitting = false,
  formId,
  serverFieldError,
  onServerFieldErrorHandled,
  footerActions,
}: PurchaseFormProps) {
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
  } = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseFormSchema),
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lineItems',
  });

  const [recentSuppliers, setRecentSuppliers] = useState<string[]>([]);

  const lineItems = watch('lineItems');
  const purchaseDate = watch('purchaseDate') ?? defaultValues.purchaseDate;
  const supplierName = watch('supplierName') ?? defaultValues.supplierName;
  const paymentStatus = watch('paymentStatus') ?? defaultValues.paymentStatus;

  const appendEmptyLineItem = useCallback(() => {
    append({
      rawMaterialId: '',
      packCount: 1,
      packSize: Number.NaN,
      unit: '',
      packPrice: 0,
    });
  }, [append]);

  const selectedRawMaterialIds = useMemo(
    () => lineItems.map((lineItem) => lineItem.rawMaterialId).filter(Boolean),
    [lineItems],
  );

  const { rawMaterialsById, isLoading: isLoadingSelectedMaterials } =
    useRawMaterialsByIds(selectedRawMaterialIds);

  useEffect(() => {
    setRecentSuppliers(getRecentSuppliers());
  }, []);

  useAutoFirstLine(Boolean(purchase), fields.length, true, appendEmptyLineItem);

  const selectedRawMaterialIdsByIndex = useMemo(
    () =>
      lineItems.map((lineItem, index) =>
        lineItems
          .filter((_, lineIndex) => lineIndex !== index)
          .map((item) => item.rawMaterialId)
          .filter(Boolean),
      ),
    [lineItems],
  );

  const grandTotal = useMemo(
    () =>
      lineItems.reduce((sum, lineItem) => {
        const packCount = Number(lineItem.packCount);
        const packPrice = Number(lineItem.packPrice);

        if (Number.isNaN(packCount) || Number.isNaN(packPrice)) {
          return sum;
        }

        return sum + Math.round(packCount * packPrice);
      }, 0),
    [lineItems],
  );

  useEffect(() => {
    if (purchase) {
      reset({
        purchaseDate: purchase.purchaseDate,
        supplierName: purchase.supplierName,
        invoiceNumber: purchase.invoiceNumber ?? '',
        paymentStatus: purchase.paymentStatus,
        // Legacy drafts (no pack metadata) load as 1 pack whose size is the full
        // quantity and whose price is the line total — same money, same stock.
        lineItems: purchase.lineItems.map((lineItem) => ({
          id: lineItem.id,
          rawMaterialId: lineItem.rawMaterialId,
          packCount: lineItem.packCount ?? 1,
          packSize: lineItem.packSize ?? lineItem.quantity,
          unit: lineItem.unit,
          packPrice: lineItem.packPrice ?? lineItem.lineTotal,
        })),
        notes: purchase.notes ?? '',
      });
      return;
    }

    reset(defaultValues);
  }, [purchase, reset]);

  useEffect(() => {
    if (!serverFieldError) {
      return;
    }

    setError(serverFieldError.field as FieldPath<PurchaseFormValues>, {
      message: serverFieldError.message,
    });
    focusPurchaseFormField(serverFieldError.field);
    onServerFieldErrorHandled?.();
  }, [serverFieldError, setError, onServerFieldErrorHandled]);

  function handleAddLineItem() {
    appendEmptyLineItem();
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
      setValue(`lineItems.${index}.unit`, material.unit, { shouldValidate: true });
    }

    clearErrors(`lineItems.${index}.rawMaterialId`);
  }

  function handleDuplicateRawMaterial(index: number) {
    setError(`lineItems.${index}.rawMaterialId`, {
      type: 'manual',
      message: DUPLICATE_RAW_MATERIAL_MESSAGE,
    });
    focusPurchaseLineItemField(index, 'rawMaterialId');
  }

  function handleInvalidSubmit(fieldErrors: typeof errors) {
    focusFirstPurchaseFormError(fieldErrors);
  }

  const paymentSelectItems = useMemo(
    () => [
      { value: 'paid', label: 'Paid' },
      { value: 'credit', label: 'Credit' },
    ],
    [],
  );

  const isFormDisabled = isSubmitting || (Boolean(purchase) && isLoadingSelectedMaterials);

  return (
    <form
      id={formId}
      onSubmit={handleSubmit(onSubmit, handleInvalidSubmit)}
      className="space-y-8"
      noValidate
    >
      <Card>
        <CardHeader>
          <CardTitle>Purchase details</CardTitle>
        </CardHeader>
        <CardContent>
          <fieldset className="space-y-4" disabled={isFormDisabled}>
            <legend className="sr-only">Purchase header details</legend>

            <div className="grid gap-4 sm:grid-cols-2">
              {purchase ? (
                <div className="space-y-2">
                  <Label htmlFor="purchaseNumber">Purchase number</Label>
                  <Input
                    id="purchaseNumber"
                    value={purchase.purchaseNumber}
                    readOnly
                    disabled
                    className="text-base"
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="purchaseDate">Purchase date *</Label>
                <Input
                  id="purchaseDate"
                  type="date"
                  className="min-h-11 text-base"
                  aria-invalid={Boolean(errors.purchaseDate)}
                  aria-describedby={errors.purchaseDate ? 'purchaseDate-error' : undefined}
                  {...register('purchaseDate')}
                />
                {errors.purchaseDate ? (
                  <p id="purchaseDate-error" className="text-sm text-destructive" role="alert">
                    {errors.purchaseDate.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="supplierName">Supplier name *</Label>
                <Input
                  id="supplierName"
                  list="purchase-supplier-suggestions"
                  className="text-base"
                  placeholder="e.g. Local Flour Supplier"
                  aria-invalid={Boolean(errors.supplierName)}
                  aria-describedby={
                    errors.supplierName ? 'supplierName-error' : 'supplierName-hint'
                  }
                  {...register('supplierName')}
                />
                <datalist id="purchase-supplier-suggestions">
                  {recentSuppliers.map((supplier) => (
                    <option key={supplier} value={supplier} />
                  ))}
                </datalist>
                {errors.supplierName ? (
                  <p id="supplierName-error" className="text-sm text-destructive" role="alert">
                    {errors.supplierName.message}
                  </p>
                ) : (
                  <p id="supplierName-hint" className="text-sm text-muted-foreground">
                    One purchase is from one supplier.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="invoiceNumber">Invoice number</Label>
                <Input
                  id="invoiceNumber"
                  className="text-base"
                  placeholder="Optional"
                  aria-invalid={Boolean(errors.invoiceNumber)}
                  aria-describedby={errors.invoiceNumber ? 'invoiceNumber-error' : undefined}
                  {...register('invoiceNumber')}
                />
                {errors.invoiceNumber ? (
                  <p id="invoiceNumber-error" className="text-sm text-destructive" role="alert">
                    {errors.invoiceNumber.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="paymentStatus">Payment status *</Label>
                <Select
                  value={paymentStatus || null}
                  items={paymentSelectItems}
                  onValueChange={(value) => {
                    if (value === 'paid' || value === 'credit') {
                      setValue('paymentStatus', value, { shouldValidate: true });
                    }
                  }}
                >
                  <SelectTrigger
                    id="paymentStatus"
                    className="min-h-11 w-full text-base sm:max-w-xs"
                    aria-invalid={Boolean(errors.paymentStatus)}
                    aria-describedby={errors.paymentStatus ? 'paymentStatus-error' : undefined}
                  >
                    <SelectValue placeholder="Select payment status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid" label="Paid">
                      Paid
                    </SelectItem>
                    <SelectItem value="credit" label="Credit">
                      Credit
                    </SelectItem>
                  </SelectContent>
                </Select>
                {errors.paymentStatus ? (
                  <p id="paymentStatus-error" className="text-sm text-destructive" role="alert">
                    {errors.paymentStatus.message}
                  </p>
                ) : null}
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

      <PurchaseDetailSummary
        purchaseDateLabel={formatPurchaseDateLabel(purchaseDate)}
        supplierLabel={supplierName.trim() || '—'}
        grandTotal={grandTotal}
        lineItemCount={fields.length}
        paymentStatus={paymentStatus === 'credit' ? 'credit' : 'paid'}
        isDraft
      />

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Line items</CardTitle>
            <CardDescription>
              Add each raw material once. Pack count, size, and price set the line total.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={handleAddLineItem}
            disabled={isFormDisabled}
          >
            <Plus />
            Add line item
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {errors.lineItems?.message ? (
            <p className="text-sm text-destructive" role="alert">
              {errors.lineItems.message}
            </p>
          ) : null}
          {errors.lineItems?.root?.message ? (
            <p className="text-sm text-destructive" role="alert">
              {errors.lineItems.root.message}
            </p>
          ) : null}

          {fields.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              No line items yet. Add at least one raw material to record this purchase.
            </div>
          ) : (
            <LineItemsGrid
              columns={PURCHASE_LINE_COLUMNS}
              rowClassName={PURCHASE_GRID_ROW_CLASS}
              minWidthClassName={PURCHASE_GRID_MIN_WIDTH}
            >
              {fields.map((field, index) => (
                <PurchaseLineItemRow
                  key={field.id}
                  index={index}
                  register={register}
                  setValue={setValue}
                  errors={errors}
                  rawMaterialId={lineItems[index]?.rawMaterialId ?? ''}
                  unit={lineItems[index]?.unit ?? ''}
                  packCount={lineItems[index]?.packCount ?? 1}
                  packSize={lineItems[index]?.packSize ?? 0}
                  packPrice={lineItems[index]?.packPrice ?? 0}
                  selectedRawMaterialIds={selectedRawMaterialIdsByIndex[index] ?? []}
                  disabled={isFormDisabled}
                  onRemove={() => remove(index)}
                  onRawMaterialChange={(rawMaterialId) =>
                    handleRawMaterialChange(index, rawMaterialId)
                  }
                  onDuplicateRawMaterial={handleDuplicateRawMaterial}
                  onPackPriceChange={(packPrice) =>
                    setValue(`lineItems.${index}.packPrice`, packPrice)
                  }
                  onAdvanceToNextLine={() => {
                    const nextIndex = index + 1;
                    const didAppend = nextIndex >= fields.length;

                    if (didAppend) {
                      appendEmptyLineItem();
                      window.requestAnimationFrame(() => {
                        window.requestAnimationFrame(() => {
                          focusPurchaseLineItemField(nextIndex, 'rawMaterialId');
                        });
                      });
                      return;
                    }

                    focusPurchaseLineItemField(nextIndex, 'rawMaterialId');
                  }}
                />
              ))}
            </LineItemsGrid>
          )}
        </CardContent>
      </Card>

      <EntryFormStickyFooter
        summary={
          <PurchaseTotalBar
            lineItemCount={fields.length}
            grandTotal={grandTotal}
            variant="compact"
          />
        }
        actions={footerActions}
      />

      {isSubmitting ? (
        <p className="sr-only" aria-live="polite">
          Saving purchase...
        </p>
      ) : null}
    </form>
  );
}
