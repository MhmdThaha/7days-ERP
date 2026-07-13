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
  const newAvgCost = Math.round((totalExistingValue + totalIncomingValue) / newQty);

  return { newQty, newAvgCost };
}
