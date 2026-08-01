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
