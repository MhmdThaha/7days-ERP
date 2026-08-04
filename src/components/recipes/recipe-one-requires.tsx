'use client';

import { useMemo } from 'react';

import { convertQuantityToKg } from '@/lib/domain/units/mass-conversion';

type IngredientLine = {
  rawMaterialId: string;
  rawMaterialName?: string;
  quantity: number;
  unit: string;
};

type RecipeOneRequiresProps = {
  recipeName: string;
  batchOutputQuantity: number | null | undefined;
  ingredients: IngredientLine[];
  resolveName?: (rawMaterialId: string) => string | undefined;
};

const MASS_UNITS = new Set(['kg', 'g', 'mg', 'kilogram', 'kilograms', 'gram', 'grams', 'milligram', 'milligrams']);

function formatAmount(value: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

function formatOneProductQuantity(quantity: number, unit: string, makes: number): string {
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(makes) || makes <= 0) {
    return '—';
  }

  const normalizedUnit = unit.trim().toLowerCase();

  if (MASS_UNITS.has(normalizedUnit)) {
    const kg = convertQuantityToKg(quantity, unit);

    if (kg !== null) {
      return `${formatAmount((kg / makes) * 1_000)} g`;
    }
  }

  return `${formatAmount(quantity / makes)} ${unit}`.trim();
}

export function RecipeOneRequires({
  recipeName,
  batchOutputQuantity,
  ingredients,
  resolveName,
}: RecipeOneRequiresProps) {
  const trimmedName = recipeName.trim();
  const makes =
    typeof batchOutputQuantity === 'number' && batchOutputQuantity > 0
      ? batchOutputQuantity
      : null;

  const lines = useMemo(() => {
    if (!makes) {
      return [];
    }

    return ingredients
      .filter((ingredient) => ingredient.rawMaterialId && Number(ingredient.quantity) > 0)
      .map((ingredient, index) => {
        const name =
          ingredient.rawMaterialName ||
          resolveName?.(ingredient.rawMaterialId) ||
          'Ingredient';

        return {
          key: `${ingredient.rawMaterialId}-${index}`,
          name,
          amount: formatOneProductQuantity(Number(ingredient.quantity), ingredient.unit, makes),
        };
      });
  }, [ingredients, makes, resolveName]);

  if (!trimmedName || !makes) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Enter Makes to see ingredient required for one product.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <h2 className="text-base font-semibold">One {trimmedName} Requires</h2>
        <p className="text-sm text-muted-foreground">
          Batch ingredients divided by Makes. Display only — not saved.
        </p>
      </div>

      {lines.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Add ingredients to see amounts for one {trimmedName}.
        </div>
      ) : (
        <div className="rounded-lg border">
          <ul className="divide-y">
            {lines.map((line) => (
              <li key={line.key} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                <span>{line.name}</span>
                <span className="tabular-nums text-muted-foreground">{line.amount}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
