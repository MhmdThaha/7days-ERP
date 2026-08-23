/**
 * Pack-based purchase pricing.
 *
 * The bakery owner enters what they actually bought — packs, pack size, and
 * pack price — and the system derives the canonical line fields. Money amounts
 * (line totals) are always integer paise; cost *rates* (unit cost) may hold
 * fractional paise so per-gram pricing stays accurate.
 */

/** Total quantity received: packs × pack size, in the material's stock unit. */
export function derivePurchaseQuantity(packCount: number, packSize: number): number {
  return Math.round(packCount * packSize * 1000) / 1000;
}

/**
 * Cost per stock unit in paise, derived from pack pricing. Kept fractional and
 * rounded to 4 decimals only to suppress float drift.
 */
export function derivePurchaseUnitCost(packPrice: number, packSize: number): number {
  return Math.round((packPrice / packSize) * 10000) / 10000;
}

/** Money actually paid for the line: packs × pack price, integer paise. */
export function calculatePurchaseLineTotal(packCount: number, packPrice: number): number {
  return Math.round(packCount * packPrice);
}

export type PurchaseTotalsInput = {
  subtotal: number;
  discountAmount?: number | null;
  adjustmentAmount?: number | null;
};

export type PurchaseTotals = {
  subtotal: number;
  discountAmount: number;
  discountedTotal: number;
  adjustmentAmount: number;
  finalPayable: number;
};

export type PurchaseTotalsField = 'discountAmount' | 'adjustmentAmount';

/** Empty / missing money fields are treated as 0. Amounts are integer paise. */
export function normalizePurchaseMoneyAmount(value: number | null | undefined): number {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 0;
  }

  return Math.round(value);
}

/**
 * Invoice-level purchase totals.
 *
 * Line inventory cost is unchanged: WAC still uses each line's unitCost.
 * `finalPayable` is what the bakery owes after discount and round-off.
 */
export function calculatePurchaseTotals(input: PurchaseTotalsInput): PurchaseTotals {
  const subtotal = normalizePurchaseMoneyAmount(input.subtotal);
  const discountAmount = normalizePurchaseMoneyAmount(input.discountAmount);
  const adjustmentAmount = normalizePurchaseMoneyAmount(input.adjustmentAmount);
  const discountedTotal = subtotal - discountAmount;
  const finalPayable = discountedTotal + adjustmentAmount;

  return {
    subtotal,
    discountAmount,
    discountedTotal,
    adjustmentAmount,
    finalPayable,
  };
}

export function getPurchaseTotalsValidationError(
  totals: PurchaseTotals,
): { field: PurchaseTotalsField; message: string } | null {
  if (totals.discountAmount < 0) {
    return { field: 'discountAmount', message: 'Discount cannot be negative.' };
  }

  if (totals.discountAmount > totals.subtotal) {
    return {
      field: 'discountAmount',
      message: 'Discount cannot be more than the items total.',
    };
  }

  if (totals.finalPayable < 0) {
    return {
      field: 'adjustmentAmount',
      message: 'Final payable cannot be negative.',
    };
  }

  return null;
}
