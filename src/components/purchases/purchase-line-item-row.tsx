'use client';

import type { FieldErrors, UseFormRegister, UseFormSetValue } from 'react-hook-form';

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
import { RawMaterialPickerCombobox } from '@/components/shared/raw-material-picker-combobox';
import { Input } from '@/components/ui/input';
import { DUPLICATE_RAW_MATERIAL_MESSAGE } from '@/lib/domain/constants/purchase';
import type { PurchaseFormValues } from '@/lib/domain/schemas/purchase.schema';
import { rememberRawMaterial } from '@/lib/utils/form-recent-values';
import { handleEnterAsTab } from '@/lib/utils/line-item-keyboard';
import { focusPurchaseLineItemField } from '@/lib/utils/purchase-form-errors';
import { PURCHASE_GRID_ROW_CLASS } from '@/lib/ui/line-items-grid-config';

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
  onAdvanceToNextLine?: () => void;
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
  onAdvanceToNextLine,
}: PurchaseLineItemRowProps) {
  const lineItemErrors = errors.lineItems?.[index];
  const materialErrorId = `line-item-${index}-rawMaterialId-error`;
  const quantityErrorId = `line-item-${index}-quantity-error`;
  const unitCostErrorId = `line-item-${index}-unitCost-error`;

  const lineTotal = Math.round((Number(quantity) || 0) * (Number(unitCost) || 0));

  const materialErrorMessage =
    lineItemErrors?.rawMaterialId?.message === DUPLICATE_RAW_MATERIAL_MESSAGE
      ? DUPLICATE_RAW_MATERIAL_MESSAGE
      : lineItemErrors?.rawMaterialId?.message;

  function handleRawMaterialSelect(value: string) {
    if (selectedRawMaterialIds.includes(value)) {
      onDuplicateRawMaterial(index);
      return;
    }

    onRawMaterialChange(value);
    setValue(`lineItems.${index}.rawMaterialId`, value, { shouldValidate: true });
    rememberRawMaterial(value);
    focusPurchaseLineItemField(index, 'quantity');
  }

  return (
    <LineItemsGridRow
      rowClassName={PURCHASE_GRID_ROW_CLASS}
      hasError={Boolean(lineItemErrors?.rawMaterialId || lineItemErrors?.quantity || lineItemErrors?.unitCost)}
    >
      <LineItemGridCell
        label="Material"
        htmlFor={`line-item-${index}-rawMaterialId`}
        error={materialErrorMessage}
      >
        <RawMaterialPickerCombobox
          id={`line-item-${index}-rawMaterialId`}
          value={rawMaterialId || null}
          disabledMaterialIds={selectedRawMaterialIds}
          onValueChange={handleRawMaterialSelect}
          disabled={disabled}
          aria-invalid={Boolean(lineItemErrors?.rawMaterialId)}
          aria-describedby={lineItemErrors?.rawMaterialId ? materialErrorId : undefined}
        />
      </LineItemGridCell>

      <LineItemGridCell
        label="Qty"
        htmlFor={`line-item-${index}-quantity`}
        error={lineItemErrors?.quantity?.message}
      >
        <Input
          id={`line-item-${index}-quantity`}
          type="number"
          step="any"
          min="0.001"
          placeholder="0"
          disabled={disabled}
          aria-invalid={Boolean(lineItemErrors?.quantity)}
          aria-describedby={lineItemErrors?.quantity ? quantityErrorId : undefined}
          className="h-8 tabular-nums"
          {...register(`lineItems.${index}.quantity`, { valueAsNumber: true })}
          onKeyDown={(event) => handleEnterAsTab(event, `line-item-${index}-unitCost`)}
        />
      </LineItemGridCell>

      <LineItemGridCell label="Unit">
        <LineItemUnitCell id={`line-item-${index}-unit`} unit={unit} />
      </LineItemGridCell>

      <LineItemGridCell
        label="Cost"
        htmlFor={`line-item-${index}-unitCost`}
        error={lineItemErrors?.unitCost?.message}
      >
        <MoneyInput
          id={`line-item-${index}-unitCost`}
          value={unitCost}
          onChange={(value) => {
            onUnitCostChange(value);
            setValue(`lineItems.${index}.unitCost`, value, { shouldValidate: true });
          }}
          disabled={disabled}
          aria-invalid={Boolean(lineItemErrors?.unitCost)}
          aria-describedby={lineItemErrors?.unitCost ? unitCostErrorId : undefined}
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
        <LineItemTotalCell id={`line-item-${index}-lineTotal`}>
          <MoneyDisplay amount={lineTotal} />
        </LineItemTotalCell>
      </LineItemGridCell>

      <LineItemDeleteCell
        onRemove={onRemove}
        disabled={disabled}
        label={`Remove line item ${index + 1}`}
      />
    </LineItemsGridRow>
  );
}
