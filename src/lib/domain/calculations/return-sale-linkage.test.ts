import { describe, expect, it } from 'vitest';

import {
  aggregateReturnedQuantitiesBySaleLineId,
  calculateLinkedLineReturnRevenue,
  calculateReturnRevenueFromReturns,
  getRemainingReturnableQuantity,
  isLinkedReturnLine,
  saleHasReturnableQuantity,
} from '@/lib/domain/calculations/return-sale-linkage';
import type { ReturnEntry } from '@/types/return';
import type { Sale } from '@/types/sale';

function linkedLine(
  saleLineId: string,
  quantity: number,
  price: number,
  productId = 'bread',
) {
  return {
    productId,
    quantity,
    saleLineId,
    sellingPriceSnapshot: price,
  };
}

function legacyLine(productId: string, quantity: number) {
  return {
    productId,
    quantity,
    saleLineId: null,
    sellingPriceSnapshot: null,
  };
}

function returnEntry(
  id: string,
  status: ReturnEntry['status'],
  lines: ReturnEntry['lines'],
): Pick<ReturnEntry, 'id' | 'status' | 'lines'> {
  return { id, status, lines };
}

const completedSale: Sale = {
  id: 'sale-1',
  organizationId: 'org-1',
  saleNumber: 'SAL-001',
  saleDate: '2026-08-10',
  customerId: null,
  customerNameSnapshot: null,
  status: 'completed',
  lines: [
    {
      id: 'sl-1',
      productId: 'kuboos',
      productNameSnapshot: 'Kuboos',
      productCodeSnapshot: 'KUB',
      sellingPriceSnapshot: 4000,
      quantity: 10,
      unit: 'pcs',
      lineTotal: 40000,
      unitCost: 2500,
      cogs: 25000,
    },
    {
      id: 'sl-2',
      productId: 'bread',
      productNameSnapshot: 'Bread',
      productCodeSnapshot: 'BRD',
      sellingPriceSnapshot: 500,
      quantity: 5,
      unit: 'pcs',
      lineTotal: 2500,
      unitCost: 400,
      cogs: 2000,
    },
  ],
  subtotal: 42500,
  totalCogs: 27000,
  lineCount: 2,
  notes: null,
  createdAt: new Date(),
  createdBy: 'u1',
  updatedAt: new Date(),
  updatedBy: 'u1',
  completedAt: new Date(),
  completedBy: 'u1',
  deletedAt: null,
  deletedBy: null,
};

describe('aggregateReturnedQuantitiesBySaleLineId', () => {
  it('accumulates completed and draft returns per sale line', () => {
    const totals = aggregateReturnedQuantitiesBySaleLineId([
      returnEntry('ret-1', 'completed', [
        {
          id: 'rl-1',
          saleLineId: 'sl-1',
          productId: 'kuboos',
          productNameSnapshot: 'Kuboos',
          productCodeSnapshot: 'KUB',
          quantity: 3,
          unit: 'pcs',
          sellingPriceSnapshot: 4000,
          unitCostSnapshot: 2500,
        },
      ]),
      returnEntry('ret-2', 'draft', [
        {
          id: 'rl-2',
          saleLineId: 'sl-1',
          productId: 'kuboos',
          productNameSnapshot: 'Kuboos',
          productCodeSnapshot: 'KUB',
          quantity: 2,
          unit: 'pcs',
          sellingPriceSnapshot: 4000,
          unitCostSnapshot: 2500,
        },
      ]),
    ]);

    expect(totals.get('sl-1')).toBe(5);
  });

  it('excludes a return being edited and ignores legacy lines', () => {
    const totals = aggregateReturnedQuantitiesBySaleLineId(
      [
        returnEntry('ret-1', 'completed', [
          {
            id: 'rl-1',
            saleLineId: 'sl-1',
            productId: 'kuboos',
            productNameSnapshot: 'Kuboos',
            productCodeSnapshot: 'KUB',
            quantity: 3,
            unit: 'pcs',
            sellingPriceSnapshot: 4000,
            unitCostSnapshot: 2500,
          },
        ]),
        returnEntry('ret-2', 'draft', [
          {
            id: 'rl-2',
            saleLineId: null,
            productId: 'kuboos',
            productNameSnapshot: 'Kuboos',
            productCodeSnapshot: 'KUB',
            quantity: 99,
            unit: 'pcs',
            sellingPriceSnapshot: null,
            unitCostSnapshot: null,
          },
        ]),
      ],
      { excludeReturnId: 'ret-2' },
    );

    expect(totals.get('sl-1')).toBe(3);
    expect(totals.has('sl-2')).toBe(false);
  });
});

describe('getRemainingReturnableQuantity', () => {
  it('returns sold minus already returned', () => {
    const returned = aggregateReturnedQuantitiesBySaleLineId([
      returnEntry('ret-1', 'completed', [
        {
          id: 'rl-1',
          saleLineId: 'sl-1',
          productId: 'kuboos',
          productNameSnapshot: 'Kuboos',
          productCodeSnapshot: 'KUB',
          quantity: 3,
          unit: 'pcs',
          sellingPriceSnapshot: 4000,
          unitCostSnapshot: 2500,
        },
      ]),
    ]);

    expect(getRemainingReturnableQuantity(completedSale.lines[0], returned)).toBe(7);
  });

  it('returns zero when fully returned', () => {
    const returned = aggregateReturnedQuantitiesBySaleLineId([
      returnEntry('ret-1', 'completed', [
        {
          id: 'rl-1',
          saleLineId: 'sl-1',
          productId: 'kuboos',
          productNameSnapshot: 'Kuboos',
          productCodeSnapshot: 'KUB',
          quantity: 10,
          unit: 'pcs',
          sellingPriceSnapshot: 4000,
          unitCostSnapshot: 2500,
        },
      ]),
    ]);

    expect(getRemainingReturnableQuantity(completedSale.lines[0], returned)).toBe(0);
    expect(saleHasReturnableQuantity(completedSale, returned)).toBe(true);
  });

  it('returns false when every sale line is fully returned', () => {
    const returned = aggregateReturnedQuantitiesBySaleLineId([
      returnEntry('ret-1', 'completed', [
        {
          id: 'rl-1',
          saleLineId: 'sl-1',
          productId: 'kuboos',
          productNameSnapshot: 'Kuboos',
          productCodeSnapshot: 'KUB',
          quantity: 10,
          unit: 'pcs',
          sellingPriceSnapshot: 4000,
          unitCostSnapshot: 2500,
        },
        {
          id: 'rl-2',
          saleLineId: 'sl-2',
          productId: 'bread',
          productNameSnapshot: 'Bread',
          productCodeSnapshot: 'BRD',
          quantity: 5,
          unit: 'pcs',
          sellingPriceSnapshot: 500,
          unitCostSnapshot: 400,
        },
      ]),
    ]);

    expect(saleHasReturnableQuantity(completedSale, returned)).toBe(false);
  });
});

describe('calculateLinkedLineReturnRevenue', () => {
  it('uses original sale-line price snapshots', () => {
    expect(calculateLinkedLineReturnRevenue({ quantity: 3, sellingPriceSnapshot: 4000 })).toBe(12000);
  });
});

describe('calculateReturnRevenueFromReturns dual path', () => {
  const daySales = [
    {
      lines: [{ productId: 'bread', quantity: 10, sellingPriceSnapshot: 500 }],
    },
  ];

  it('prices linked returns from snapshots even when today has no sales', () => {
    const revenue = calculateReturnRevenueFromReturns(
      [{ lines: [linkedLine('sl-old', 3, 4000, 'kuboos')] }],
      [],
    );

    expect(revenue).toBe(12000);
  });

  it('allows negative net sales when gross sales are zero', () => {
    const returnRevenue = calculateReturnRevenueFromReturns(
      [{ lines: [linkedLine('sl-old', 3, 4000, 'kuboos')] }],
      [],
    );
    const grossSales = 0;
    const netSales = grossSales - returnRevenue;

    expect(netSales).toBe(-12000);
  });

  it('falls back to legacy FIFO for unlinked lines', () => {
    const revenue = calculateReturnRevenueFromReturns(
      [{ lines: [legacyLine('bread', 4)] }],
      daySales,
    );

    expect(revenue).toBe(2000);
  });

  it('combines linked and legacy returns on the same day', () => {
    const revenue = calculateReturnRevenueFromReturns(
      [
        {
          lines: [linkedLine('sl-old', 2, 4000, 'kuboos'), legacyLine('bread', 4)],
        },
      ],
      daySales,
    );

    expect(revenue).toBe(8000 + 2000);
  });

  it('prices same product at different linked prices independently', () => {
    const revenue = calculateReturnRevenueFromReturns(
      [
        {
          lines: [
            linkedLine('sl-a', 2, 4000, 'kuboos'),
            linkedLine('sl-b', 1, 5000, 'kuboos'),
          ],
        },
      ],
      [],
    );

    expect(revenue).toBe(13000);
  });
});

describe('isLinkedReturnLine', () => {
  it('requires sale line id and price snapshot', () => {
    expect(isLinkedReturnLine(linkedLine('sl-1', 1, 4000))).toBe(true);
    expect(isLinkedReturnLine(legacyLine('bread', 1))).toBe(false);
  });
});
