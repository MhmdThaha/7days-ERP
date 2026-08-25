'use client';

import { Trash2 } from 'lucide-react';
import type { FieldErrors, UseFormRegister, UseFormSetValue } from 'react-hook-form';

import { ProductPickerCombobox } from '@/components/shared/product-picker-combobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { USER_FIELD_SET_VALUE_OPTIONS } from '@/lib/forms/user-field-set-value-options';
import { DUPLICATE_PRODUCT_MESSAGE } from '@/lib/domain/constants/return';
import type { LegacyReturnFormValues } from '@/lib/domain/schemas/return.schema';
import { cn } from '@/lib/utils';

type ReturnLineItemRowProps = {
  index: number;
  register: UseFormRegister<LegacyReturnFormValues>;
  setValue: UseFormSetValue<LegacyReturnFormValues>;
  errors: FieldErrors<LegacyReturnFormValues>;
  productId: string;
  unit: string;
  selectedProductIds: string[];
  disabled?: boolean;
  onRemove: () => void;
  onProductChange: (productId: string) => void;
  onDuplicateProduct: (index: number) => void;
};

export function ReturnLineItemRow({
  index,
  register,
  setValue,
  errors,
  productId,
  unit,
  selectedProductIds,
  disabled = false,
  onRemove,
  onProductChange,
  onDuplicateProduct,
}: ReturnLineItemRowProps) {
  const lineErrors = errors.lines?.[index];
  const productErrorId = `return-line-${index}-productId-error`;
  const quantityErrorId = `return-line-${index}-quantity-error`;

  function handleProductSelect(value: string) {
    if (selectedProductIds.includes(value)) {
      onDuplicateProduct(index);
      return;
    }

    onProductChange(value);
    setValue(`lines.${index}.productId`, value, USER_FIELD_SET_VALUE_OPTIONS);
  }

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 shadow-xs',
        lineErrors?.productId && 'border-destructive/50 ring-1 ring-destructive/20',
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Product Line {index + 1}</p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove product line ${index + 1}`}
        >
          <Trash2 />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))]">
        <div className="space-y-2 sm:col-span-2 xl:col-span-1">
          <Label htmlFor={`return-line-${index}-productId`}>Product *</Label>
          <ProductPickerCombobox
            id={`return-line-${index}-productId`}
            value={productId || null}
            disabledProductIds={selectedProductIds}
            onValueChange={handleProductSelect}
            disabled={disabled}
            aria-invalid={Boolean(lineErrors?.productId)}
            aria-describedby={lineErrors?.productId ? productErrorId : undefined}
          />
          {lineErrors?.productId ? (
            <p id={productErrorId} className="text-sm text-destructive" role="alert">
              {lineErrors.productId.message === DUPLICATE_PRODUCT_MESSAGE
                ? DUPLICATE_PRODUCT_MESSAGE
                : lineErrors.productId.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`return-line-${index}-quantity`}>Quantity *</Label>
          <Input
            id={`return-line-${index}-quantity`}
            type="number"
            step="any"
            min="0.001"
            placeholder="Enter quantity"
            disabled={disabled}
            aria-invalid={Boolean(lineErrors?.quantity)}
            aria-describedby={
              lineErrors?.quantity ? quantityErrorId : `return-line-${index}-quantity-hint`
            }
            className="tabular-nums"
            {...register(`lines.${index}.quantity`, { valueAsNumber: true })}
          />
          {lineErrors?.quantity ? (
            <p id={quantityErrorId} className="text-sm text-destructive" role="alert">
              {lineErrors.quantity.message}
            </p>
          ) : (
            <p id={`return-line-${index}-quantity-hint`} className="text-sm text-muted-foreground">
              Must be greater than zero.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`return-line-${index}-unit`}>Unit</Label>
          <Input
            id={`return-line-${index}-unit`}
            value={unit}
            readOnly
            disabled
            aria-readonly="true"
          />
        </div>
      </div>
    </div>
  );
}
