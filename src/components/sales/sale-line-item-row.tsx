'use client';

import type { Control, FieldErrors, UseFormRegister, UseFormSetValue } from 'react-hook-form';
import { Controller } from 'react-hook-form';

import {
  LineItemDeleteCell,
  LineItemTotalCell,
  LineItemUnitCell,
} from '@/components/shared/line-items-grid/line-item-cells';
import {
  LineItemGridCell,
  LineItemsGridRow,
} from '@/components/shared/line-items-grid/line-items-grid';
import { MoneyDisplay } from '@/components/shared/money-display';
import { MoneyInput } from '@/components/shared/money-input';
import { ProductPickerCombobox } from '@/components/shared/product-picker-combobox';
import { Input } from '@/components/ui/input';
import { DUPLICATE_PRODUCT_MESSAGE } from '@/lib/domain/constants/sale';
import type { SaleFormValues } from '@/lib/domain/schemas/sale.schema';
import { handleEnterAsTab } from '@/lib/utils/line-item-keyboard';
import { focusSaleLineField } from '@/lib/utils/sale-form-errors';
import { formatWastageStock } from '@/lib/utils/wastage-stock-validation';
import { SALE_GRID_ROW_CLASS } from '@/lib/ui/line-items-grid-config';
import type { ProductListItem } from '@/types/product';

type SaleLineItemRowProps = {
  fieldId: string;
  index: number;
  control: Control<SaleFormValues>;
  register: UseFormRegister<SaleFormValues>;
  setValue: UseFormSetValue<SaleFormValues>;
  errors: FieldErrors<SaleFormValues>;
  productId: string;
  unit: string;
  sellingPrice: number;
  quantity: number;
  selectedProduct: ProductListItem | null;
  isLoadingProduct?: boolean;
  selectedProductIds: string[];
  disabled?: boolean;
  onRemove: () => void;
  onProductChange: (productId: string) => void;
  onProductResolved: (product: ProductListItem) => void;
  onDuplicateProduct: (index: number) => void;
  onSellingPriceChange: (sellingPrice: number) => void;
  onAdvanceToNextLine?: () => void;
};

export function SaleLineItemRow({
  fieldId,
  index,
  control,
  register,
  setValue,
  errors,
  productId,
  unit,
  sellingPrice,
  quantity,
  selectedProduct,
  isLoadingProduct = false,
  selectedProductIds,
  disabled = false,
  onRemove,
  onProductChange,
  onProductResolved,
  onDuplicateProduct,
  onSellingPriceChange,
  onAdvanceToNextLine,
}: SaleLineItemRowProps) {
  const pickerId = `sale-line-${index}-productId`;

  const lineErrors = errors.lines?.[index];
  const productErrorId = `sale-line-${index}-productId-error`;
  const quantityErrorId = `sale-line-${index}-quantity-error`;
  const quantityHintId = `sale-line-${index}-quantity-hint`;
  const sellingPriceErrorId = `sale-line-${index}-sellingPrice-error`;

  const showAvailableStock = Boolean(productId);
  const availableStockHint = isLoadingProduct
    ? 'Loading available stock…'
    : selectedProduct
      ? `Available: ${formatWastageStock(selectedProduct.currentStock, selectedProduct.unit)}`
      : productId
        ? 'Loading available stock…'
        : undefined;

  const lineTotal = Math.round((Number(quantity) || 0) * (Number(sellingPrice) || 0));

  const productErrorMessage =
    lineErrors?.productId?.message === DUPLICATE_PRODUCT_MESSAGE
      ? DUPLICATE_PRODUCT_MESSAGE
      : lineErrors?.productId?.message;

  function handleProductSelect(value: string) {
    if (selectedProductIds.includes(value)) {
      onDuplicateProduct(index);
      return;
    }

    onProductChange(value);
    focusSaleLineField(index, 'quantity');
  }

  return (
    <LineItemsGridRow
      rowClassName={SALE_GRID_ROW_CLASS}
      hasError={Boolean(lineErrors?.productId || lineErrors?.quantity || lineErrors?.sellingPrice)}
    >
      <LineItemGridCell
        label="Product"
        htmlFor={pickerId}
        error={productErrorMessage}
      >
        <Controller
          control={control}
          name={`lines.${index}.productId`}
          render={({ field }) => (
            <ProductPickerCombobox
              id={pickerId}
              rowFieldId={fieldId}
              value={field.value || null}
              disabledProductIds={selectedProductIds}
              onValueChange={(value) => {
                field.onChange(value);
                handleProductSelect(value);
              }}
              onProductResolved={onProductResolved}
              disabled={disabled}
              aria-invalid={Boolean(lineErrors?.productId)}
              aria-describedby={lineErrors?.productId ? productErrorId : undefined}
            />
          )}
        />
      </LineItemGridCell>

      <LineItemGridCell
        label="Qty"
        htmlFor={`sale-line-${index}-quantity`}
        error={lineErrors?.quantity?.message}
      >
        <Input
          id={`sale-line-${index}-quantity`}
          type="number"
          step="any"
          min="0.001"
          placeholder="0"
          disabled={disabled}
          aria-invalid={Boolean(lineErrors?.quantity)}
          aria-describedby={
            lineErrors?.quantity
              ? quantityErrorId
              : showAvailableStock
                ? quantityHintId
                : undefined
          }
          className="h-8 tabular-nums"
          {...register(`lines.${index}.quantity`, { valueAsNumber: true })}
          onKeyDown={(event) => handleEnterAsTab(event, `sale-line-${index}-sellingPrice`)}
        />
        {!lineErrors?.quantity && showAvailableStock && availableStockHint ? (
          <p id={quantityHintId} className="text-xs text-muted-foreground">
            {availableStockHint}
          </p>
        ) : null}
      </LineItemGridCell>

      <LineItemGridCell label="Unit">
        <LineItemUnitCell id={`sale-line-${index}-unit`} unit={unit} />
      </LineItemGridCell>

      <LineItemGridCell
        label="Price"
        htmlFor={`sale-line-${index}-sellingPrice`}
        error={lineErrors?.sellingPrice?.message}
      >
        <MoneyInput
          id={`sale-line-${index}-sellingPrice`}
          value={sellingPrice}
          onChange={(value) => {
            onSellingPriceChange(value);
            setValue(`lines.${index}.sellingPrice`, value, { shouldValidate: true });
          }}
          disabled={disabled}
          aria-invalid={Boolean(lineErrors?.sellingPrice)}
          aria-describedby={lineErrors?.sellingPrice ? sellingPriceErrorId : undefined}
          className="[&_input]:h-8"
          onKeyDown={(event) => {
            if (event.key !== 'Enter') {
              return;
            }

            event.preventDefault();
            onAdvanceToNextLine?.();
          }}
        />
      </LineItemGridCell>

      <LineItemGridCell label="Total">
        <LineItemTotalCell id={`sale-line-${index}-lineTotal`}>
          <MoneyDisplay amount={lineTotal} />
        </LineItemTotalCell>
      </LineItemGridCell>

      <LineItemDeleteCell
        onRemove={onRemove}
        disabled={disabled}
        label={`Remove product line ${index + 1}`}
      />
    </LineItemsGridRow>
  );
}
