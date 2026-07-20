'use client';

import { Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import type { FieldErrors, UseFormRegister, UseFormSetValue } from 'react-hook-form';

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
import { DUPLICATE_PRODUCT_MESSAGE } from '@/lib/domain/constants/wastage';
import type { WastageFormValues } from '@/lib/domain/schemas/wastage.schema';
import { cn } from '@/lib/utils';
import { formatWastageStock } from '@/lib/utils/wastage-stock-validation';
import type { ProductListItem } from '@/types/product';

function formatProductLabel(product: ProductListItem): string {
  return `${product.code} - ${product.name}`;
}

type WastageLineItemRowProps = {
  index: number;
  register: UseFormRegister<WastageFormValues>;
  setValue: UseFormSetValue<WastageFormValues>;
  errors: FieldErrors<WastageFormValues>;
  productId: string;
  unit: string;
  availableStock: number | null;
  stockErrorMessage: string | null;
  products: ProductListItem[];
  selectedProductIds: string[];
  disabled?: boolean;
  onRemove: () => void;
  onProductChange: (productId: string) => void;
  onDuplicateProduct: (index: number) => void;
};

export function WastageLineItemRow({
  index,
  register,
  setValue,
  errors,
  productId,
  unit,
  availableStock,
  stockErrorMessage,
  products,
  selectedProductIds,
  disabled = false,
  onRemove,
  onProductChange,
  onDuplicateProduct,
}: WastageLineItemRowProps) {
  const lineErrors = errors.lines?.[index];
  const productErrorId = `wastage-line-${index}-productId-error`;
  const quantityErrorId = `wastage-line-${index}-quantity-error`;
  const quantityHintId = `wastage-line-${index}-quantity-hint`;
  const hasQuantitySchemaError = Boolean(lineErrors?.quantity);
  const hasStockError = Boolean(stockErrorMessage);
  const showAvailableStock = availableStock !== null && productId;

  const productSelectItems = useMemo(
    () =>
      products.map((product) => ({
        value: product.id,
        label: formatProductLabel(product),
      })),
    [products],
  );

  function handleProductSelect(value: string | null) {
    if (!value) {
      return;
    }

    if (selectedProductIds.includes(value)) {
      onDuplicateProduct(index);
      return;
    }

    onProductChange(value);
    setValue(`lines.${index}.productId`, value, { shouldValidate: true });
  }

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 shadow-xs',
        (lineErrors?.productId || hasStockError) &&
          'border-destructive/50 ring-1 ring-destructive/20',
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <div className="space-y-2 sm:col-span-2 xl:col-span-1">
          <Label htmlFor={`wastage-line-${index}-productId`}>Product *</Label>
          <Select
            value={productId || null}
            items={productSelectItems}
            onValueChange={handleProductSelect}
            disabled={disabled}
          >
            <SelectTrigger
              id={`wastage-line-${index}-productId`}
              className="w-full"
              aria-invalid={Boolean(lineErrors?.productId)}
              aria-describedby={lineErrors?.productId ? productErrorId : undefined}
            >
              <SelectValue placeholder="Select product" />
            </SelectTrigger>
            <SelectContent>
              {products.map((product) => {
                const isAlreadyAdded = selectedProductIds.includes(product.id);
                const label = isAlreadyAdded
                  ? `${formatProductLabel(product)} (already added)`
                  : formatProductLabel(product);

                return (
                  <SelectItem
                    key={product.id}
                    value={product.id}
                    label={label}
                    disabled={isAlreadyAdded}
                  >
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {lineErrors?.productId ? (
            <p id={productErrorId} className="text-sm text-destructive" role="alert">
              {lineErrors.productId.message === DUPLICATE_PRODUCT_MESSAGE
                ? DUPLICATE_PRODUCT_MESSAGE
                : lineErrors.productId.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`wastage-line-${index}-quantity`}>Quantity *</Label>
          <Input
            id={`wastage-line-${index}-quantity`}
            type="number"
            step="any"
            min="0.001"
            placeholder="Enter quantity"
            disabled={disabled}
            aria-invalid={hasQuantitySchemaError || hasStockError}
            aria-describedby={
              hasQuantitySchemaError || hasStockError
                ? quantityErrorId
                : showAvailableStock
                  ? quantityHintId
                  : undefined
            }
            className="tabular-nums"
            {...register(`lines.${index}.quantity`, { valueAsNumber: true })}
          />
          {hasQuantitySchemaError ? (
            <p id={quantityErrorId} className="text-sm text-destructive" role="alert">
              {lineErrors?.quantity?.message}
            </p>
          ) : hasStockError ? (
            <p id={quantityErrorId} className="text-sm text-destructive" role="alert">
              {stockErrorMessage}
            </p>
          ) : showAvailableStock ? (
            <p id={quantityHintId} className="text-sm text-muted-foreground">
              Available: {formatWastageStock(availableStock, unit)}. Must be greater than zero.
            </p>
          ) : (
            <p id={quantityHintId} className="text-sm text-muted-foreground">
              Must be greater than zero.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`wastage-line-${index}-availableStock`}>Available Stock</Label>
          <Input
            id={`wastage-line-${index}-availableStock`}
            value={showAvailableStock ? formatWastageStock(availableStock, unit) : '—'}
            readOnly
            disabled
            aria-readonly="true"
            className="tabular-nums"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`wastage-line-${index}-unit`}>Unit</Label>
          <Input
            id={`wastage-line-${index}-unit`}
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
