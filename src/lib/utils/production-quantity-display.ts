import {
  convertQuantity,
  getUnitFamily,
  normalizeConvertibleUnit,
} from '@/lib/domain/units/uom-conversion';

/** Production UI quantity labels only. Does not change stored or calculated values. */
export function formatProductionQuantityDisplay(value: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/**
 * Picks a readable initial display unit for Production material preview.
 * Does not change canonical/stock quantity.
 */
export function chooseReadableDisplayUnit(
  canonicalQuantity: number,
  canonicalUnit: string,
): string {
  const normalized = normalizeConvertibleUnit(canonicalUnit);
  const family = getUnitFamily(canonicalUnit);

  if (!normalized || !family || !Number.isFinite(canonicalQuantity) || canonicalQuantity === 0) {
    return canonicalUnit;
  }

  if (family === 'weight') {
    const kilograms = convertQuantity(canonicalQuantity, normalized, 'kg');

    if (Math.abs(kilograms) >= 1) {
      return 'kg';
    }

    const grams = convertQuantity(canonicalQuantity, normalized, 'g');

    if (Math.abs(grams) >= 1) {
      return 'g';
    }

    return 'mg';
  }

  const liters = convertQuantity(canonicalQuantity, normalized, 'L');

  if (Math.abs(liters) >= 1) {
    return 'L';
  }

  return 'ml';
}
