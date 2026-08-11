/**
 * Sales import money semantics — unit price vs line total normalization.
 *
 * Import rows use major units (rupees). Sale commit converts unit price to paise.
 * Pure helpers only — no Firestore or sale execution.
 */

import type { NormalizedValue } from '@/lib/import/engine/types';

export const PREPARATION_MONEY_ERROR = {
  INCONSISTENT_RATE_AMOUNT: 'MONEY_INCONSISTENT_RATE_AMOUNT',
  ZERO_QUANTITY_WITH_AMOUNT: 'MONEY_ZERO_QUANTITY_WITH_AMOUNT',
} as const;

export type PreparationMoneyErrorCode =
  (typeof PREPARATION_MONEY_ERROR)[keyof typeof PREPARATION_MONEY_ERROR];

export type PreparationRowBlockingError = {
  code: PreparationMoneyErrorCode;
  message: string;
};

/** Major units (rupees) → integer paise. Matches importMoneyToSaleMinorUnits. */
export function majorUnitsToMinor(major: number): number {
  return Math.round(major * 100);
}

/** Integer paise → major units (rupees). */
export function minorUnitsToMajor(minor: number): number {
  return minor / 100;
}

export function hasMoneyValue(value: NormalizedValue | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function readQuantity(value: NormalizedValue | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

/** Line total in major units from quantity × unit price (same rounding as saleService). */
export function calculateLineTotalMajor(quantity: number, unitPriceMajor: number): number {
  const lineMinor = Math.round(quantity * majorUnitsToMinor(unitPriceMajor));

  return minorUnitsToMajor(lineMinor);
}

/** Unit price in major units from line total ÷ quantity. */
export function deriveUnitPriceMajor(lineTotalMajor: number, quantity: number): number {
  if (quantity <= 0) {
    throw new Error('deriveUnitPriceMajor requires a positive quantity.');
  }

  const unitMinor = Math.round(majorUnitsToMinor(lineTotalMajor) / quantity);

  return minorUnitsToMajor(unitMinor);
}

/** True when qty × unit price matches line total within 1 paisa. */
export function moneyValuesConsistent(
  quantity: number,
  unitPriceMajor: number,
  lineTotalMajor: number,
): boolean {
  const expectedMinor = Math.round(quantity * majorUnitsToMinor(unitPriceMajor));
  const actualMinor = majorUnitsToMinor(lineTotalMajor);

  return Math.abs(expectedMinor - actualMinor) <= 1;
}
