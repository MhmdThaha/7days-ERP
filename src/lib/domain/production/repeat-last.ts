export type RepeatLastFormLine = {
  productId: string;
  quantity: number;
  unit: string;
};

/** Same ordering as productionRepository.list() JavaScript sort and Repeat Last Firestore query. */
export function compareProductionsForRepeatLast(
  a: { productionDate: string; productionNumber: string },
  b: { productionDate: string; productionNumber: string },
): number {
  const dateCompare = b.productionDate.localeCompare(a.productionDate);

  if (dateCompare !== 0) {
    return dateCompare;
  }

  return b.productionNumber.localeCompare(a.productionNumber);
}

export function pickLatestProductionForRepeat<
  T extends { productionDate: string; productionNumber: string },
>(productions: T[]): T | undefined {
  return [...productions].sort(compareProductionsForRepeatLast)[0];
}

export function toRepeatLastFormLines(
  lines: ReadonlyArray<{ productId: string; quantity: number; unit: string }>,
): RepeatLastFormLine[] {
  return lines.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    unit: line.unit,
  }));
}
