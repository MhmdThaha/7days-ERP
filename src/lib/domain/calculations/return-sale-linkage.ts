import type { ReturnEntry, ReturnLineItem } from '@/types/return';
import type { Sale, SaleLineItem } from '@/types/sale';

import { calculateReturnRevenueFromDaySales } from '@/lib/domain/calculations/summary-aggregation';

export type ReturnedQuantityBySaleLineId = Map<string, number>;

export function isLinkedReturnLine(line: Pick<ReturnLineItem, 'saleLineId' | 'sellingPriceSnapshot'>): boolean {
  return Boolean(line.saleLineId && line.sellingPriceSnapshot !== null);
}

export function aggregateReturnedQuantitiesBySaleLineId(
  returns: Array<Pick<ReturnEntry, 'id' | 'status' | 'lines'>>,
  options?: { excludeReturnId?: string; includeDrafts?: boolean },
): ReturnedQuantityBySaleLineId {
  const totals = new Map<string, number>();
  const excludeReturnId = options?.excludeReturnId;
  const includeDrafts = options?.includeDrafts ?? true;

  for (const returnEntry of returns) {
    if (excludeReturnId && returnEntry.id === excludeReturnId) {
      continue;
    }

    if (returnEntry.status === 'completed' || (includeDrafts && returnEntry.status === 'draft')) {
      for (const line of returnEntry.lines) {
        if (!line.saleLineId) {
          continue;
        }

        totals.set(line.saleLineId, (totals.get(line.saleLineId) ?? 0) + line.quantity);
      }
    }
  }

  return totals;
}

export function getRemainingReturnableQuantity(
  saleLine: Pick<SaleLineItem, 'id' | 'quantity'>,
  returnedBySaleLineId: ReturnedQuantityBySaleLineId,
): number {
  const alreadyReturned = returnedBySaleLineId.get(saleLine.id) ?? 0;
  return Math.max(0, saleLine.quantity - alreadyReturned);
}

export function calculateLinkedLineReturnRevenue(
  line: Pick<ReturnLineItem, 'quantity' | 'sellingPriceSnapshot'>,
): number {
  if (line.sellingPriceSnapshot === null) {
    return 0;
  }

  return Math.round(line.quantity * line.sellingPriceSnapshot);
}

type ReturnRevenueLine = {
  productId: string;
  quantity: number;
  saleLineId: string | null;
  sellingPriceSnapshot: number | null;
};

type ReturnRevenueSaleLine = {
  productId: string;
  quantity: number;
  sellingPriceSnapshot: number;
};

export function calculateReturnRevenueFromReturns(
  dayReturns: Array<{ lines: ReturnRevenueLine[] }>,
  daySales: Array<{ lines: ReturnRevenueSaleLine[] }>,
): number {
  let linkedRevenue = 0;
  const legacyReturns: Array<{ lines: Array<{ productId: string; quantity: number }> }> = [];

  for (const returnEntry of dayReturns) {
    const legacyLines: Array<{ productId: string; quantity: number }> = [];

    for (const line of returnEntry.lines) {
      if (isLinkedReturnLine(line)) {
        linkedRevenue += calculateLinkedLineReturnRevenue(line);
        continue;
      }

      legacyLines.push({ productId: line.productId, quantity: line.quantity });
    }

    if (legacyLines.length > 0) {
      legacyReturns.push({ lines: legacyLines });
    }
  }

  return linkedRevenue + calculateReturnRevenueFromDaySales(daySales, legacyReturns);
}

export function findSaleLine(sale: Sale, saleLineId: string): SaleLineItem | undefined {
  return sale.lines.find((line) => line.id === saleLineId);
}

export function saleHasReturnableQuantity(
  sale: Sale,
  returnedBySaleLineId: ReturnedQuantityBySaleLineId,
): boolean {
  return sale.lines.some((line) => getRemainingReturnableQuantity(line, returnedBySaleLineId) > 0);
}
