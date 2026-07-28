'use client';

import type { FieldErrors, UseFormRegister, UseFormSetValue } from 'react-hook-form';

import {
  LineItemReorderActionsCell,
  LineItemUnitCell,
} from '@/components/shared/line-items-grid/line-item-cells';
import {
  LineItemGridCell,
  LineItemsGridRow,
} from '@/components/shared/line-items-grid/line-items-grid';
import { RawMaterialPickerCombobox } from '@/components/shared/raw-material-picker-combobox';
import { Input } from '@/components/ui/input';
import type { RecipeFormValues } from '@/lib/domain/schemas/recipe.schema';
import { rememberRawMaterial } from '@/lib/utils/form-recent-values';
import { focusRecipeIngredientField } from '@/lib/utils/recipe-form-errors';
import { RECIPE_GRID_ROW_CLASS } from '@/lib/ui/line-items-grid-config';

type RecipeIngredientRowProps = {
  index: number;
  register: UseFormRegister<RecipeFormValues>;
  setValue: UseFormSetValue<RecipeFormValues>;
  errors: FieldErrors<RecipeFormValues>;
  rawMaterialId: string;
  unit: string;
  selectedRawMaterialIds: string[];
  disabled?: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onRawMaterialChange: (rawMaterialId: string) => void;
  onAdvanceToNextLine?: () => void;
};

export function RecipeIngredientRow({
  index,
  register,
  setValue,
  errors,
  rawMaterialId,
  unit,
  selectedRawMaterialIds,
  disabled = false,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRemove,
  onRawMaterialChange,
  onAdvanceToNextLine,
}: RecipeIngredientRowProps) {
  const ingredientErrors = errors.ingredients?.[index];

  return (
    <LineItemsGridRow
      rowClassName={RECIPE_GRID_ROW_CLASS}
      hasError={Boolean(ingredientErrors?.rawMaterialId || ingredientErrors?.quantity)}
    >
      <LineItemGridCell
        label="Material"
        htmlFor={`ingredient-${index}-rawMaterialId`}
        error={ingredientErrors?.rawMaterialId?.message}
      >
        <RawMaterialPickerCombobox
          id={`ingredient-${index}-rawMaterialId`}
          value={rawMaterialId || null}
          disabledMaterialIds={selectedRawMaterialIds}
          hideSelectedMaterials
          onValueChange={(value) => {
            onRawMaterialChange(value);
            setValue(`ingredients.${index}.rawMaterialId`, value, { shouldValidate: true });
            rememberRawMaterial(value);
            focusRecipeIngredientField(index, 'quantity');
          }}
          disabled={disabled}
          aria-invalid={Boolean(ingredientErrors?.rawMaterialId)}
        />
      </LineItemGridCell>

      <LineItemGridCell
        label="Qty"
        htmlFor={`ingredient-${index}-quantity`}
        error={ingredientErrors?.quantity?.message}
      >
        <Input
          id={`ingredient-${index}-quantity`}
          type="number"
          step="any"
          min="0"
          placeholder="0"
          disabled={disabled}
          aria-invalid={Boolean(ingredientErrors?.quantity)}
          className="h-8 tabular-nums"
          {...register(`ingredients.${index}.quantity`, { valueAsNumber: true })}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') {
              return;
            }

            event.preventDefault();
            onAdvanceToNextLine?.();
          }}
        />
      </LineItemGridCell>

      <LineItemGridCell label="Unit">
        <LineItemUnitCell id={`ingredient-${index}-unit`} unit={unit} />
      </LineItemGridCell>

      <LineItemReorderActionsCell
        index={index}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onRemove={onRemove}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        disabled={disabled}
      />
    </LineItemsGridRow>
  );
}
