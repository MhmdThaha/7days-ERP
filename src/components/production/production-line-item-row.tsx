'use client';

import {
  Controller,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
} from 'react-hook-form';

import {
  LineItemDeleteCell,
  LineItemUnitCell,
} from '@/components/shared/line-items-grid/line-item-cells';
import {
  LineItemGridCell,
  LineItemsGridRow,
} from '@/components/shared/line-items-grid/line-items-grid';
import { ProductPickerCombobox } from '@/components/shared/product-picker-combobox';
import { Input } from '@/components/ui/input';
import { DUPLICATE_PRODUCT_MESSAGE } from '@/lib/domain/constants/production';
import type { ProductionFormValues } from '@/lib/domain/schemas/production.schema';
import { focusProductionLineField } from '@/lib/utils/production-form-errors';
import { PRODUCTION_GRID_ROW_CLASS } from '@/lib/ui/line-items-grid-config';
import type { ProductListItem } from '@/types/product';

type ProductionLineItemRowProps = {
  index: number;
  control: Control<ProductionFormValues>;
  register: UseFormRegister<ProductionFormValues>;
  setValue: UseFormSetValue<ProductionFormValues>;
  errors: FieldErrors<ProductionFormValues>;
  productId: string;
  unit: string;
  selectedProduct: ProductListItem | null;
  selectedProductIds: string[];
  filterProduct?: (product: ProductListItem) => boolean;
  disabled?: boolean;
  onRemove: () => void;
  onProductChange: (productId: string) => void;
  onDuplicateProduct: (index: number) => void;
  onAdvanceToNextLine?: () => void;
};

export function ProductionLineItemRow({
  index,
  control,
  register: _register,
  setValue,
  errors,
  productId,
  unit,
  selectedProduct,
  selectedProductIds,
  filterProduct,
  disabled = false,
  onRemove,
  onProductChange,
  onDuplicateProduct,
  onAdvanceToNextLine,
}: ProductionLineItemRowProps) {
  const lineErrors = errors.lines?.[index];
  const productErrorId = `production-line-${index}-productId-error`;
  const quantityErrorId = `production-line-${index}-quantity-error`;

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
    setValue(`lines.${index}.productId`, value, { shouldValidate: true });
    focusProductionLineField(index, 'quantity');
  }

  return (
    <LineItemsGridRow
      rowClassName={PRODUCTION_GRID_ROW_CLASS}
      hasError={Boolean(lineErrors?.productId || lineErrors?.quantity)}
    >
      <LineItemGridCell
        label="Product"
        htmlFor={`production-line-${index}-productId`}
        error={productErrorMessage}
        hint={
          selectedProduct && !lineErrors?.productId
            ? `Stock: ${selectedProduct.currentStock.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${selectedProduct.unit}`
            : undefined
        }
      >
        <ProductPickerCombobox
          id={`production-line-${index}-productId`}
          value={productId || null}
          disabledProductIds={selectedProductIds}
          filterProduct={filterProduct}
          onValueChange={handleProductSelect}
          emptyMessage="No eligible products match your search."
          disabled={disabled}
          aria-invalid={Boolean(lineErrors?.productId)}
          aria-describedby={lineErrors?.productId ? productErrorId : undefined}
        />
      </LineItemGridCell>

      <LineItemGridCell
        label="Qty"
        htmlFor={`production-line-${index}-quantity`}
        error={lineErrors?.quantity?.message}
      >
        <Controller
          control={control}
          name={`lines.${index}.quantity`}
          render={({ field }) => (
            <Input
              id={`production-line-${index}-quantity`}
              type="number"
              step="any"
              min="0.001"
              placeholder="0"
              disabled={disabled}
              aria-invalid={Boolean(lineErrors?.quantity)}
              aria-describedby={lineErrors?.quantity ? quantityErrorId : undefined}
              className="h-8 tabular-nums"
              value={Number.isNaN(field.value) ? '' : field.value}
              onChange={(event) => {
                const nextValue =
                  event.target.value === '' ? Number.NaN : event.target.valueAsNumber;
                field.onChange(nextValue);
              }}
              onBlur={field.onBlur}
              ref={field.ref}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') {
                  return;
                }

                event.preventDefault();
                onAdvanceToNextLine?.();
              }}
            />
          )}
        />
      </LineItemGridCell>

      <LineItemGridCell label="Unit">
        <LineItemUnitCell id={`production-line-${index}-unit`} unit={unit} />
      </LineItemGridCell>

      <LineItemDeleteCell
        onRemove={onRemove}
        disabled={disabled}
        label={`Remove product line ${index + 1}`}
      />
    </LineItemsGridRow>
  );
}
