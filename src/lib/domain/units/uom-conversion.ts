/**
 * Centralized Unit of Measure conversion — weight and volume families only.
 *
 * Allowed: mg ↔ g ↔ kg, ml ↔ L
 * Rejected: any cross-family conversion (kg ↔ ml, etc.)
 *
 * Canonical storage remains each raw material's existing `unit`.
 * Convert user entry → material unit before purchase/recipe/inventory math.
 */

import { DomainError } from '@/lib/domain/errors';

export const WEIGHT_UNITS = ['mg', 'g', 'kg'] as const;
export const VOLUME_UNITS = ['ml', 'L'] as const;

export type WeightUnit = (typeof WEIGHT_UNITS)[number];
export type VolumeUnit = (typeof VOLUME_UNITS)[number];
export type ConvertibleUnit = WeightUnit | VolumeUnit;
export type UnitFamily = 'weight' | 'volume';

const WEIGHT_TO_MG: Record<WeightUnit, number> = {
  mg: 1,
  g: 1_000,
  kg: 1_000_000,
};

const VOLUME_TO_ML: Record<VolumeUnit, number> = {
  ml: 1,
  L: 1_000,
};

const UNIT_ALIASES: Record<string, ConvertibleUnit> = {
  mg: 'mg',
  milligram: 'mg',
  milligrams: 'mg',
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  ml: 'ml',
  milliliter: 'ml',
  millilitre: 'ml',
  milliliters: 'ml',
  millilitres: 'ml',
  l: 'L',
  liter: 'L',
  litre: 'L',
  liters: 'L',
  litres: 'L',
};

function roundQuantity(value: number): number {
  // Keep bakery pack/recipe precision without float noise.
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Normalizes a unit string to a supported convertible unit, or null. */
export function normalizeConvertibleUnit(unit: string): ConvertibleUnit | null {
  const key = unit.trim().toLowerCase();

  if (!key) {
    return null;
  }

  return UNIT_ALIASES[key] ?? null;
}

export function getUnitFamily(unit: string): UnitFamily | null {
  const normalized = normalizeConvertibleUnit(unit);

  if (!normalized) {
    return null;
  }

  if ((WEIGHT_UNITS as readonly string[]).includes(normalized)) {
    return 'weight';
  }

  return 'volume';
}

export function isConvertibleUnit(unit: string): boolean {
  return normalizeConvertibleUnit(unit) !== null;
}

export function areUnitsCompatible(fromUnit: string, toUnit: string): boolean {
  const fromFamily = getUnitFamily(fromUnit);
  const toFamily = getUnitFamily(toUnit);

  return fromFamily !== null && fromFamily === toFamily;
}

/** Units the user may pick for entry/display given a material's stock unit. */
export function listCompatibleUnits(canonicalUnit: string): readonly ConvertibleUnit[] {
  const family = getUnitFamily(canonicalUnit);

  if (family === 'weight') {
    return WEIGHT_UNITS;
  }

  if (family === 'volume') {
    return VOLUME_UNITS;
  }

  return [];
}

/**
 * Converts a quantity between compatible units.
 * Throws DomainError when units are missing, unsupported, or cross-family.
 */
export function convertQuantity(value: number, fromUnit: string, toUnit: string): number {
  if (!Number.isFinite(value)) {
    throw new DomainError('VALIDATION_ERROR', 'Quantity must be a valid number.');
  }

  const from = normalizeConvertibleUnit(fromUnit);
  const to = normalizeConvertibleUnit(toUnit);

  if (!from || !to) {
    throw new DomainError(
      'VALIDATION_ERROR',
      `Unsupported unit conversion from "${fromUnit}" to "${toUnit}".`,
    );
  }

  if (from === to) {
    return value;
  }

  const fromFamily = getUnitFamily(from);
  const toFamily = getUnitFamily(to);

  if (fromFamily !== toFamily) {
    throw new DomainError(
      'VALIDATION_ERROR',
      `Cannot convert ${from} to ${to}. Only conversions within the same unit family are allowed.`,
    );
  }

  if (fromFamily === 'weight') {
    const inMg = value * WEIGHT_TO_MG[from as WeightUnit];
    return roundQuantity(inMg / WEIGHT_TO_MG[to as WeightUnit]);
  }

  const inMl = value * VOLUME_TO_ML[from as VolumeUnit];
  return roundQuantity(inMl / VOLUME_TO_ML[to as VolumeUnit]);
}

/**
 * Converts entry quantity into a material's canonical/stock unit.
 * Same-unit and non-convertible masters (piece, bag, …) pass through unchanged
 * when entry unit already matches canonical (case-insensitive) or equals after normalize.
 */
export function convertToCanonicalQuantity(
  value: number,
  entryUnit: string,
  canonicalUnit: string,
): number {
  const entry = entryUnit.trim();
  const canonical = canonicalUnit.trim();

  if (!entry || !canonical) {
    throw new DomainError('VALIDATION_ERROR', 'Unit is required for quantity conversion.');
  }

  if (entry.toLowerCase() === canonical.toLowerCase()) {
    return value;
  }

  const entryConvertible = normalizeConvertibleUnit(entry);
  const canonicalConvertible = normalizeConvertibleUnit(canonical);

  // Non-convertible masters (piece, dozen, …): only exact match is allowed.
  if (!entryConvertible || !canonicalConvertible) {
    throw new DomainError(
      'VALIDATION_ERROR',
      `Unit "${entry}" does not match stock unit "${canonical}".`,
    );
  }

  return convertQuantity(value, entryConvertible, canonicalConvertible);
}

/** Display helper — converts for presentation without mutating stored stock. */
export function formatQuantityInUnit(
  canonicalQuantity: number,
  canonicalUnit: string,
  displayUnit: string,
): string {
  const quantity =
    displayUnit.trim().toLowerCase() === canonicalUnit.trim().toLowerCase()
      ? canonicalQuantity
      : convertQuantity(canonicalQuantity, canonicalUnit, displayUnit);

  const formatted = quantity.toLocaleString('en-IN', { maximumFractionDigits: 6 });
  const unitLabel = normalizeConvertibleUnit(displayUnit) ?? displayUnit;

  return `${formatted} ${unitLabel}`;
}
