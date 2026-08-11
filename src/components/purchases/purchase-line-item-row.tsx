'use client';

import type { FieldErrors, UseFormRegister, UseFormSetValue } from 'react-hook-form';

import {
  LineItemDeleteCell,
  LineItemTotalCell,
  LineItemUnitSelect,
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
import {
  convertQuantity,
  listCompatibleUnits,
} from '@/lib/domain/units/uom-conversion';
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
  packCount: number;
  packSize: number;
  packPrice: number;
  selectedRawMaterialIds: string[];
  disabled?: boolean;
  onRemove: () => void;
  onRawMaterialChange: (rawMaterialId: string) => void;
  onDuplicateRawMaterial: (index: number) => void;
  onPackPriceChange: (packPrice: number) => void;
  onAdvanceToNextLine?: () => void;
};

function formatDerivedUnitCost(packPrice: number, packSize: number, unit: string): string | null {
  if (!(packPrice > 0) || !(packSize > 0)) {
    return null;
  }

  const rupeesPerUnit = packPrice / packSize / 100;
  const formatted = rupeesPerUnit.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

  return `₹${formatted}/${unit || 'unit'}`;
}

function formatDerivedQuantity(packCount: number, packSize: number, unit: string): string | null {
  if (!(packCount > 0) || !(packSize > 0)) {
    return null;
  }

  const quantity = Math.round(packCount * packSize * 1000) / 1000;

  return `= ${quantity.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${unit || ''}`.trim();
}

export function PurchaseLineItemRow({
  index,
  register,
  setValue,
  errors,
  rawMaterialId,
  unit,
  packCount,
  packSize,
  packPrice,
  selectedRawMaterialIds,
  disabled = false,
  onRemove,
  onRawMaterialChange,
  onDuplicateRawMaterial,
  onPackPriceChange,
  onAdvanceToNextLine,
}: PurchaseLineItemRowProps) {
  const lineItemErrors = errors.lineItems?.[index];
  const materialErrorId = `line-item-${index}-rawMaterialId-error`;
  const packCountErrorId = `line-item-${index}-packCount-error`;
  const packSizeErrorId = `line-item-${index}-packSize-error`;
  const packPriceErrorId = `line-item-${index}-packPrice-error`;

  const safePackCount = Number(packCount) || 0;
  const safePackSize = Number(packSize) || 0;
  const safePackPrice = Number(packPrice) || 0;
  const lineTotal = Math.round(safePackCount * safePackPrice);
  const derivedUnitCost = formatDerivedUnitCost(safePackPrice, safePackSize, unit);
  const derivedQuantity =
    safePackCount !== 1 ? formatDerivedQuantity(safePackCount, safePackSize, unit) : null;

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
    focusPurchaseLineItemField(index, 'packSize');
  }

  function handleUnitChange(nextUnit: string) {
    if (nextUnit === unit) {
      return;
    }

    const currentSize = Number(packSize);

    if (Number.isFinite(currentSize) && currentSize > 0) {
      try {
        const converted = convertQuantity(currentSize, unit, nextUnit);
        setValue(`lineItems.${index}.packSize`, converted, { shouldValidate: true });
      } catch {
        // Keep numeric value if conversion is unavailable; unit still updates for entry.
      }
    }

    setValue(`lineItems.${index}.unit`, nextUnit, { shouldValidate: true });
  }

  const unitOptions = listCompatibleUnits(unit);

  return (
    <LineItemsGridRow
      rowClassName={PURCHASE_GRID_ROW_CLASS}
      hasError={Boolean(
        lineItemErrors?.rawMaterialId ||
          lineItemErrors?.packCount ||
          lineItemErrors?.packSize ||
          lineItemErrors?.packPrice,
      )}
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
        label="Packs"
        htmlFor={`line-item-${index}-packCount`}
        error={lineItemErrors?.packCount?.message}
      >
        <Input
          id={`line-item-${index}-packCount`}
          type="number"
          step="any"
          min="0.001"
          placeholder="1"
          disabled={disabled}
          aria-invalid={Boolean(lineItemErrors?.packCount)}
          aria-describedby={lineItemErrors?.packCount ? packCountErrorId : undefined}
          className="h-8 tabular-nums"
          {...register(`lineItems.${index}.packCount`, { valueAsNumber: true })}
          onKeyDown={(event) => handleEnterAsTab(event, `line-item-${index}-packSize`)}
        />
      </LineItemGridCell>

      <LineItemGridCell
        label="Pack Size"
        htmlFor={`line-item-${index}-packSize`}
        error={lineItemErrors?.packSize?.message}
        hint={derivedQuantity ?? undefined}
      >
        <Input
          id={`line-item-${index}-packSize`}
          type="number"
          step="any"
          min="0.001"
          placeholder="0"
          disabled={disabled}
          aria-invalid={Boolean(lineItemErrors?.packSize)}
          aria-describedby={lineItemErrors?.packSize ? packSizeErrorId : undefined}
          className="h-8 tabular-nums"
          {...register(`lineItems.${index}.packSize`, { valueAsNumber: true })}
          onKeyDown={(event) => handleEnterAsTab(event, `line-item-${index}-packPrice`)}
        />
      </LineItemGridCell>

      <LineItemGridCell label="Unit">
        <LineItemUnitSelect
          id={`line-item-${index}-unit`}
          value={unit}
          options={unitOptions}
          disabled={disabled || !unit}
          onValueChange={handleUnitChange}
        />
      </LineItemGridCell>

      <LineItemGridCell
        label="Pack Price"
        htmlFor={`line-item-${index}-packPrice`}
        error={lineItemErrors?.packPrice?.message}
        hint={derivedUnitCost ?? undefined}
      >
        <MoneyInput
          id={`line-item-${index}-packPrice`}
          value={packPrice}
          onChange={(value) => {
            onPackPriceChange(value);
            setValue(`lineItems.${index}.packPrice`, value, { shouldValidate: true });
          }}
          disabled={disabled}
          aria-invalid={Boolean(lineItemErrors?.packPrice)}
          aria-describedby={lineItemErrors?.packPrice ? packPriceErrorId : undefined}
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
          <span
            title={
              derivedUnitCost
                ? `${derivedQuantity ?? ''} ${derivedQuantity ? '· ' : ''}${derivedUnitCost} auto-calculated`.trim()
                : undefined
            }
          >
            <MoneyDisplay amount={lineTotal} />
          </span>
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
