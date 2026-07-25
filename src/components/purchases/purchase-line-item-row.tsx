'use client';

import { Trash2 } from 'lucide-react';
import type { FieldErrors, UseFormRegister, UseFormSetValue } from 'react-hook-form';

import { MoneyDisplay } from '@/components/shared/money-display';
import { MoneyInput } from '@/components/shared/money-input';
import { RawMaterialPickerCombobox } from '@/components/shared/raw-material-picker-combobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DUPLICATE_RAW_MATERIAL_MESSAGE } from '@/lib/domain/constants/purchase';
import type { PurchaseFormValues } from '@/lib/domain/schemas/purchase.schema';
import { cn } from '@/lib/utils';

type PurchaseLineItemRowProps = {
  index: number;
  register: UseFormRegister<PurchaseFormValues>;
  setValue: UseFormSetValue<PurchaseFormValues>;
  errors: FieldErrors<PurchaseFormValues>;
  rawMaterialId: string;
  unit: string;
  unitCost: number;
  quantity: number;
  selectedRawMaterialIds: string[];
  disabled?: boolean;
  onRemove: () => void;
  onRawMaterialChange: (rawMaterialId: string) => void;
  onDuplicateRawMaterial: (index: number) => void;
  onUnitCostChange: (unitCost: number) => void;
};

export function PurchaseLineItemRow({
  index,
  register,
  setValue,
  errors,
  rawMaterialId,
  unit,
  unitCost,
  quantity,
  selectedRawMaterialIds,
  disabled = false,
  onRemove,
  onRawMaterialChange,
  onDuplicateRawMaterial,
  onUnitCostChange,
}: PurchaseLineItemRowProps) {
  const lineItemErrors = errors.lineItems?.[index];
  const rawMaterialErrorId = `line-item-${index}-rawMaterialId-error`;
  const quantityErrorId = `line-item-${index}-quantity-error`;
  const unitCostErrorId = `line-item-${index}-unitCost-error`;

  const lineTotal = Math.round((Number(quantity) || 0) * (Number(unitCost) || 0));

  function handleRawMaterialSelect(value: string) {
    if (selectedRawMaterialIds.includes(value)) {
      onDuplicateRawMaterial(index);
      return;
    }

    onRawMaterialChange(value);
    setValue(`lineItems.${index}.rawMaterialId`, value, { shouldValidate: true });
  }

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 shadow-xs',
        lineItemErrors?.rawMaterialId && 'border-destructive/50 ring-1 ring-destructive/20',
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Line Item {index + 1}</p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove line item ${index + 1}`}
        >
          <Trash2 />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
        <div className="space-y-2 sm:col-span-2 xl:col-span-1">
          <Label htmlFor={`line-item-${index}-rawMaterialId`}>Ingredient *</Label>
          <RawMaterialPickerCombobox
            id={`line-item-${index}-rawMaterialId`}
            value={rawMaterialId || null}
            disabledMaterialIds={selectedRawMaterialIds}
            onValueChange={handleRawMaterialSelect}
            disabled={disabled}
            aria-invalid={Boolean(lineItemErrors?.rawMaterialId)}
            aria-describedby={lineItemErrors?.rawMaterialId ? rawMaterialErrorId : undefined}
          />
          {lineItemErrors?.rawMaterialId ? (
            <p id={rawMaterialErrorId} className="text-sm text-destructive" role="alert">
              {lineItemErrors.rawMaterialId.message === DUPLICATE_RAW_MATERIAL_MESSAGE
                ? DUPLICATE_RAW_MATERIAL_MESSAGE
                : lineItemErrors.rawMaterialId.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`line-item-${index}-quantity`}>Quantity *</Label>
          <Input
            id={`line-item-${index}-quantity`}
            type="number"
            step="any"
            min="0.001"
            placeholder="Enter quantity"
            disabled={disabled}
            aria-invalid={Boolean(lineItemErrors?.quantity)}
            aria-describedby={
              lineItemErrors?.quantity
                ? quantityErrorId
                : `line-item-${index}-quantity-hint`
            }
            className="tabular-nums"
            {...register(`lineItems.${index}.quantity`, { valueAsNumber: true })}
          />
          {lineItemErrors?.quantity ? (
            <p id={quantityErrorId} className="text-sm text-destructive" role="alert">
              {lineItemErrors.quantity.message}
            </p>
          ) : (
            <p id={`line-item-${index}-quantity-hint`} className="text-sm text-muted-foreground">
              Must be greater than zero.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`line-item-${index}-unit`}>Unit</Label>
          <Input
            id={`line-item-${index}-unit`}
            value={unit}
            readOnly
            disabled
            aria-readonly="true"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`line-item-${index}-unitCost`}>Unit Cost *</Label>
          <MoneyInput
            id={`line-item-${index}-unitCost`}
            value={unitCost}
            onChange={(value) => {
              onUnitCostChange(value);
              setValue(`lineItems.${index}.unitCost`, value, { shouldValidate: true });
            }}
            disabled={disabled}
            aria-invalid={Boolean(lineItemErrors?.unitCost)}
            aria-describedby={
              lineItemErrors?.unitCost ? unitCostErrorId : `line-item-${index}-unitCost-hint`
            }
          />
          {lineItemErrors?.unitCost ? (
            <p id={unitCostErrorId} className="text-sm text-destructive" role="alert">
              {lineItemErrors.unitCost.message}
            </p>
          ) : (
            <p id={`line-item-${index}-unitCost-hint`} className="text-sm text-muted-foreground">
              Must be greater than zero.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`line-item-${index}-lineTotal`}>Line Total</Label>
          <div
            id={`line-item-${index}-lineTotal`}
            className="flex h-8 items-center rounded-lg border bg-muted/40 px-2.5 text-sm tabular-nums"
          >
            <MoneyDisplay amount={lineTotal} />
          </div>
        </div>
      </div>
    </div>
  );
}
