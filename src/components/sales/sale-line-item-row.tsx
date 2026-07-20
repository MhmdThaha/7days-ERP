'use client';

import { Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import type { FieldErrors, UseFormRegister, UseFormSetValue } from 'react-hook-form';

import { MoneyDisplay } from '@/components/shared/money-display';
import { MoneyInput } from '@/components/shared/money-input';
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
import { DUPLICATE_PRODUCT_MESSAGE } from '@/lib/domain/constants/sale';
import type { SaleFormValues } from '@/lib/domain/schemas/sale.schema';
import { cn } from '@/lib/utils';
import type { ProductListItem } from '@/types/product';

function formatProductLabel(product: ProductListItem): string {
  return `${product.code} - ${product.name}`;
}

type SaleLineItemRowProps = {
  index: number;
  register: UseFormRegister<SaleFormValues>;
  setValue: UseFormSetValue<SaleFormValues>;
  errors: FieldErrors<SaleFormValues>;
  productId: string;
  unit: string;
  sellingPrice: number;
  quantity: number;
  products: ProductListItem[];
  selectedProductIds: string[];
  disabled?: boolean;
  onRemove: () => void;
  onProductChange: (productId: string) => void;
  onDuplicateProduct: (index: number) => void;
  onSellingPriceChange: (sellingPrice: number) => void;
};

export function SaleLineItemRow({
  index,
  register,
  setValue,
  errors,
  productId,
  unit,
  sellingPrice,
  quantity,
  products,
  selectedProductIds,
  disabled = false,
  onRemove,
  onProductChange,
  onDuplicateProduct,
  onSellingPriceChange,
}: SaleLineItemRowProps) {
  const lineErrors = errors.lines?.[index];
  const productErrorId = `sale-line-${index}-productId-error`;
  const quantityErrorId = `sale-line-${index}-quantity-error`;
  const sellingPriceErrorId = `sale-line-${index}-sellingPrice-error`;

  const productSelectItems = useMemo(
    () =>
      products.map((product) => ({
        value: product.id,
        label: formatProductLabel(product),
      })),
    [products],
  );

  const lineTotal = Math.round((Number(quantity) || 0) * (Number(sellingPrice) || 0));

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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
        <div className="space-y-2 sm:col-span-2 xl:col-span-1">
          <Label htmlFor={`sale-line-${index}-productId`}>Product *</Label>
          <Select
            value={productId || null}
            items={productSelectItems}
            onValueChange={handleProductSelect}
            disabled={disabled}
          >
            <SelectTrigger
              id={`sale-line-${index}-productId`}
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
          <Label htmlFor={`sale-line-${index}-quantity`}>Quantity *</Label>
          <Input
            id={`sale-line-${index}-quantity`}
            type="number"
            step="any"
            min="0.001"
            placeholder="Enter quantity"
            disabled={disabled}
            aria-invalid={Boolean(lineErrors?.quantity)}
            aria-describedby={
              lineErrors?.quantity ? quantityErrorId : `sale-line-${index}-quantity-hint`
            }
            className="tabular-nums"
            {...register(`lines.${index}.quantity`, { valueAsNumber: true })}
          />
          {lineErrors?.quantity ? (
            <p id={quantityErrorId} className="text-sm text-destructive" role="alert">
              {lineErrors.quantity.message}
            </p>
          ) : (
            <p id={`sale-line-${index}-quantity-hint`} className="text-sm text-muted-foreground">
              Must be greater than zero.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`sale-line-${index}-unit`}>Unit</Label>
          <Input id={`sale-line-${index}-unit`} value={unit} readOnly disabled aria-readonly="true" />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`sale-line-${index}-sellingPrice`}>Selling Price *</Label>
          <MoneyInput
            id={`sale-line-${index}-sellingPrice`}
            value={sellingPrice}
            onChange={(value) => {
              onSellingPriceChange(value);
              setValue(`lines.${index}.sellingPrice`, value, { shouldValidate: true });
            }}
            disabled={disabled}
            aria-invalid={Boolean(lineErrors?.sellingPrice)}
            aria-describedby={
              lineErrors?.sellingPrice
                ? sellingPriceErrorId
                : `sale-line-${index}-sellingPrice-hint`
            }
          />
          {lineErrors?.sellingPrice ? (
            <p id={sellingPriceErrorId} className="text-sm text-destructive" role="alert">
              {lineErrors.sellingPrice.message}
            </p>
          ) : (
            <p id={`sale-line-${index}-sellingPrice-hint`} className="text-sm text-muted-foreground">
              Defaults from product master. Editable for this sale only.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`sale-line-${index}-lineTotal`}>Line Total</Label>
          <div
            id={`sale-line-${index}-lineTotal`}
            className="flex h-8 items-center rounded-lg border bg-muted/40 px-2.5 text-sm tabular-nums"
          >
            <MoneyDisplay amount={lineTotal} />
          </div>
        </div>
      </div>
    </div>
  );
}
