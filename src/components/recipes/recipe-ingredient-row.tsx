'use client';

import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import type { FieldErrors, UseFormRegister, UseFormSetValue } from 'react-hook-form';

import { RawMaterialPickerCombobox } from '@/components/shared/raw-material-picker-combobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { RecipeFormValues } from '@/lib/domain/schemas/recipe.schema';

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
}: RecipeIngredientRowProps) {
  const ingredientErrors = errors.ingredients?.[index];

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Ingredient {index + 1}</p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onMoveUp}
            disabled={disabled || !canMoveUp}
            aria-label={`Move ingredient ${index + 1} up`}
          >
            <ChevronUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onMoveDown}
            disabled={disabled || !canMoveDown}
            aria-label={`Move ingredient ${index + 1} down`}
          >
            <ChevronDown />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Remove ingredient ${index + 1}`}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <Label htmlFor={`ingredient-${index}-rawMaterialId`}>Ingredient</Label>
          <RawMaterialPickerCombobox
            id={`ingredient-${index}-rawMaterialId`}
            value={rawMaterialId || null}
            disabledMaterialIds={selectedRawMaterialIds}
            hideSelectedMaterials
            onValueChange={(value) => {
              onRawMaterialChange(value);
              setValue(`ingredients.${index}.rawMaterialId`, value, { shouldValidate: true });
            }}
            disabled={disabled}
            aria-invalid={Boolean(ingredientErrors?.rawMaterialId)}
          />
          {ingredientErrors?.rawMaterialId ? (
            <p className="text-sm text-destructive">{ingredientErrors.rawMaterialId.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`ingredient-${index}-quantity`}>Quantity</Label>
          <Input
            id={`ingredient-${index}-quantity`}
            type="number"
            step="any"
            min="0"
            disabled={disabled}
            aria-invalid={Boolean(ingredientErrors?.quantity)}
            {...register(`ingredients.${index}.quantity`, { valueAsNumber: true })}
          />
          {ingredientErrors?.quantity ? (
            <p className="text-sm text-destructive">{ingredientErrors.quantity.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`ingredient-${index}-unit`}>Unit</Label>
          <Input id={`ingredient-${index}-unit`} value={unit} readOnly disabled />
        </div>
      </div>
    </div>
  );
}
