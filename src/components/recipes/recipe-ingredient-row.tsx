'use client';

import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
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
import type { RecipeFormValues } from '@/lib/domain/schemas/recipe.schema';
import type { RawMaterialListItem } from '@/types/raw-material';

function formatRawMaterialLabel(material: RawMaterialListItem): string {
  return `${material.code} - ${material.name}`;
}

type RecipeIngredientRowProps = {
  index: number;
  register: UseFormRegister<RecipeFormValues>;
  setValue: UseFormSetValue<RecipeFormValues>;
  errors: FieldErrors<RecipeFormValues>;
  rawMaterialId: string;
  unit: string;
  rawMaterials: RawMaterialListItem[];
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
  rawMaterials,
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
  const availableMaterials = rawMaterials.filter(
    (material) =>
      material.id === rawMaterialId || !selectedRawMaterialIds.includes(material.id),
  );

  const rawMaterialSelectItems = useMemo(
    () =>
      availableMaterials.map((material) => ({
        value: material.id,
        label: formatRawMaterialLabel(material),
      })),
    [availableMaterials],
  );

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
          <Label htmlFor={`ingredient-${index}-rawMaterialId`}>Raw Material</Label>
          <Select
            value={rawMaterialId || null}
            items={rawMaterialSelectItems}
            onValueChange={(value) => {
              if (!value) {
                return;
              }

              onRawMaterialChange(value);
              setValue(`ingredients.${index}.rawMaterialId`, value, { shouldValidate: true });
            }}
            disabled={disabled}
          >
            <SelectTrigger
              id={`ingredient-${index}-rawMaterialId`}
              aria-invalid={Boolean(ingredientErrors?.rawMaterialId)}
            >
              <SelectValue placeholder="Select raw material" />
            </SelectTrigger>
            <SelectContent>
              {availableMaterials.map((material) => (
                <SelectItem
                  key={material.id}
                  value={material.id}
                  label={formatRawMaterialLabel(material)}
                >
                  {formatRawMaterialLabel(material)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
