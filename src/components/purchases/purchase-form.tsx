'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useFieldArray, useForm, type FieldPath } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';

import { listRawMaterialsAction } from '@/actions/raw-materials';
import { PurchaseLineItemRow } from '@/components/purchases/purchase-line-item-row';
import { PurchaseTotalBar } from '@/components/purchases/purchase-total-bar';
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
import { DUPLICATE_RAW_MATERIAL_MESSAGE } from '@/lib/domain/constants/purchase';
import {
  purchaseFormSchema,
  type PurchaseFormValues,
} from '@/lib/domain/schemas/purchase.schema';
import {
  focusFirstPurchaseFormError,
  focusPurchaseFormField,
  focusPurchaseLineItemField,
  getLocalDateString,
  type PurchaseFieldError,
} from '@/lib/utils/purchase-form-errors';
import type { Purchase } from '@/types/purchase';

type PurchaseFormProps = {
  purchase?: Purchase;
  onSubmit: (values: PurchaseFormValues) => Promise<void>;
  isSubmitting?: boolean;
  formId: string;
  serverFieldError?: PurchaseFieldError | null;
  onServerFieldErrorHandled?: () => void;
};

const defaultValues: PurchaseFormValues = {
  purchaseDate: getLocalDateString(),
  supplierName: '',
  invoiceNumber: '',
  paymentStatus: 'paid',
  lineItems: [],
  notes: '',
};

export function PurchaseForm({
  purchase,
  onSubmit,
  isSubmitting = false,
  formId,
  serverFieldError,
  onServerFieldErrorHandled,
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

  const lineItems = watch('lineItems');
  const paymentStatus = watch('paymentStatus');

  const { data: rawMaterialsResult, isLoading: isLoadingRawMaterials } = useQuery({
    queryKey: ['raw-materials', 'purchase-picker'],
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

  const rawMaterials = rawMaterialsResult?.items ?? [];

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
        const quantity = Number(lineItem.quantity);
        const unitCost = Number(lineItem.unitCost);

        if (Number.isNaN(quantity) || Number.isNaN(unitCost)) {
          return sum;
        }

        return sum + Math.round(quantity * unitCost);
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
        lineItems: purchase.lineItems.map((lineItem) => ({
          id: lineItem.id,
          rawMaterialId: lineItem.rawMaterialId,
          quantity: lineItem.quantity,
          unit: lineItem.unit,
          unitCost: lineItem.unitCost,
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
    append({
      rawMaterialId: '',
      quantity: Number.NaN,
      unit: '',
      unitCost: 0,
    });
  }

  function handleRawMaterialChange(index: number, rawMaterialId: string) {
    const material = rawMaterials.find((item) => item.id === rawMaterialId);

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

  const isLoadingPickers = isLoadingRawMaterials;
  const isFormDisabled = isSubmitting || isLoadingPickers;

  return (
    <form
      id={formId}
      onSubmit={handleSubmit(onSubmit, handleInvalidSubmit)}
      className="space-y-6"
      noValidate
    >
      <fieldset className="space-y-4" disabled={isFormDisabled}>
        <legend className="sr-only">Purchase header details</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          {purchase ? (
            <div className="space-y-2">
              <Label htmlFor="purchaseNumber">Purchase Number</Label>
              <Input id="purchaseNumber" value={purchase.purchaseNumber} readOnly disabled />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="purchaseDate">Purchase Date *</Label>
            <Input
              id="purchaseDate"
              type="date"
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
            <Label htmlFor="supplierName">Supplier Name *</Label>
            <Input
              id="supplierName"
              placeholder="e.g. Local Flour Supplier"
              aria-invalid={Boolean(errors.supplierName)}
              aria-describedby={
                errors.supplierName ? 'supplierName-error' : 'supplierName-hint'
              }
              {...register('supplierName')}
            />
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
            <Label htmlFor="invoiceNumber">Invoice Number</Label>
            <Input
              id="invoiceNumber"
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
            <Label htmlFor="paymentStatus">Payment Status *</Label>
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
                className="w-full sm:max-w-xs"
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
            <h2 className="text-base font-semibold">Line Items</h2>
            <p className="text-sm text-muted-foreground">
              One purchase is from one supplier. Add each raw material once — duplicate materials
              in the same purchase are not allowed.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={handleAddLineItem}
            disabled={isFormDisabled}
          >
            <Plus />
            Add Line Item
          </Button>
        </div>

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

        {isLoadingPickers ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading raw materials">
            {Array.from({ length: Math.max(fields.length, 1) }).map((_, index) => (
              <Skeleton key={index} className="h-40 w-full rounded-lg" />
            ))}
          </div>
        ) : fields.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            No line items yet. Add at least one raw material to record this purchase.
          </div>
        ) : (
          <div className="space-y-3">
            {fields.map((field, index) => (
              <PurchaseLineItemRow
                key={field.id}
                index={index}
                register={register}
                setValue={setValue}
                errors={errors}
                rawMaterialId={lineItems[index]?.rawMaterialId ?? ''}
                unit={lineItems[index]?.unit ?? ''}
                unitCost={lineItems[index]?.unitCost ?? 0}
                quantity={lineItems[index]?.quantity ?? 0}
                rawMaterials={rawMaterials}
                selectedRawMaterialIds={selectedRawMaterialIdsByIndex[index] ?? []}
                disabled={isFormDisabled}
                onRemove={() => remove(index)}
                onRawMaterialChange={(rawMaterialId) =>
                  handleRawMaterialChange(index, rawMaterialId)
                }
                onDuplicateRawMaterial={handleDuplicateRawMaterial}
                onUnitCostChange={(unitCost) =>
                  setValue(`lineItems.${index}.unitCost`, unitCost)
                }
              />
            ))}
          </div>
        )}
      </div>

      <PurchaseTotalBar lineItemCount={fields.length} grandTotal={grandTotal} />

      {isSubmitting ? (
        <p className="sr-only" aria-live="polite">
          Saving purchase...
        </p>
      ) : null}
    </form>
  );
}
