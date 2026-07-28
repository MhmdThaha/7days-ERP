/**
 * Mass conversion utilities for recipe, production, costing, and inventory.
 *
 * Internal base unit: kilograms (kg).
 * Mass and volume (via density) quantities convert to kg before aggregation.
 */

export const MASS_BASE_UNIT = 'kg' as const;

/** Default liquid density until per-material density is supported (kg/L). */
export const DEFAULT_LIQUID_DENSITY_KG_PER_L = 1;

export type MassConvertibleUnit = 'kg' | 'g' | 'mg' | 'l' | 'ml';

export type QuantityInput = {
  quantity: number;
  unit: string;
  /** Liquid density in kg/L; defaults to {@link DEFAULT_LIQUID_DENSITY_KG_PER_L}. */
  densityKgPerL?: number;
};

const UNIT_ALIASES: Record<string, MassConvertibleUnit> = {
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  g: 'g',
  gram: 'g',
  grams: 'g',
  mg: 'mg',
  milligram: 'mg',
  milligrams: 'mg',
  l: 'l',
  liter: 'l',
  litre: 'l',
  liters: 'l',
  litres: 'l',
  ml: 'ml',
  milliliter: 'ml',
  millilitre: 'ml',
  milliliters: 'ml',
  millilitres: 'ml',
};

function toMassConvertibleUnit(unit: string): MassConvertibleUnit | null {
  const normalized = unit.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return UNIT_ALIASES[normalized] ?? null;
}

/**
 * Converts a single quantity to kilograms.
 * Returns null when the unit cannot be converted (e.g. piece, dozen).
 */
export function convertQuantityToKg(
  quantity: number,
  unit: string,
  options?: { densityKgPerL?: number },
): number | null {
  if (!Number.isFinite(quantity)) {
    return null;
  }

  const massUnit = toMassConvertibleUnit(unit);

  if (!massUnit) {
    return null;
  }

  const density = options?.densityKgPerL ?? DEFAULT_LIQUID_DENSITY_KG_PER_L;

  switch (massUnit) {
    case 'kg':
      return quantity;
    case 'g':
      return quantity / 1_000;
    case 'mg':
      return quantity / 1_000_000;
    case 'l':
      return quantity * density;
    case 'ml':
      return (quantity / 1_000) * density;
    default:
      return null;
  }
}

export function isConvertibleToKg(unit: string): boolean {
  return toMassConvertibleUnit(unit) !== null;
}

/**
 * Sums ingredient quantities after converting each line to kg.
 * Non-mass units (piece, dozen, etc.) are excluded from the total.
 */
export function sumQuantitiesAsKg(items: readonly QuantityInput[]): number {
  let totalKg = 0;

  for (const item of items) {
    const kg = convertQuantityToKg(item.quantity, item.unit, {
      densityKgPerL: item.densityKgPerL,
    });

    if (kg !== null) {
      totalKg += kg;
    }
  }

  return totalKg;
}

export function formatMassKg(value: number): string {
  return `${value.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${MASS_BASE_UNIT}`;
}
