export type WacResult = {
  newQty: number;
  newAvgCost: number;
};

export function calculateNewWac(
  existingQty: number,
  existingAvgCost: number,
  incomingQty: number,
  incomingUnitCost: number,
): WacResult {
  const newQty = existingQty + incomingQty;

  if (incomingQty <= 0) {
    return { newQty, newAvgCost: existingAvgCost };
  }

  if (existingQty <= 0) {
    return { newQty, newAvgCost: incomingUnitCost };
  }

  const totalExistingValue = existingQty * existingAvgCost;
  const totalIncomingValue = incomingQty * incomingUnitCost;
  // Average cost is a rate (paise per stock unit), not a money amount, so it keeps
  // fractional paise. Rounded to 4 decimals only to suppress float drift.
  const newAvgCost =
    Math.round(((totalExistingValue + totalIncomingValue) / newQty) * 10000) / 10000;

  return { newQty, newAvgCost };
}
