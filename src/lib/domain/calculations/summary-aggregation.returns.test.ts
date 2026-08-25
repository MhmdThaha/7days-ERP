import { describe, expect, it } from 'vitest';

import {
  calculateNetCogsAfterReturns,
  calculateReturnRevenueFromDaySales,
} from '@/lib/domain/calculations/summary-aggregation';

describe('calculateReturnRevenueFromDaySales', () => {
  const daySales = [
    {
      lines: [
        {
          productId: 'bread',
          quantity: 10,
          sellingPriceSnapshot: 500,
        },
      ],
    },
  ];

  it('subtracts full return revenue from same-day sales', () => {
    const dayReturns = [
      {
        lines: [{ productId: 'bread', quantity: 10 }],
      },
    ];

    expect(calculateReturnRevenueFromDaySales(daySales, dayReturns)).toBe(5000);
  });

  it('subtracts partial return revenue from same-day sales', () => {
    const dayReturns = [
      {
        lines: [{ productId: 'bread', quantity: 4 }],
      },
    ];

    expect(calculateReturnRevenueFromDaySales(daySales, dayReturns)).toBe(2000);
  });
});

describe('calculateNetCogsAfterReturns', () => {
  it('reduces sale COGS by return COGS without going negative', () => {
    expect(calculateNetCogsAfterReturns(4000, 1600)).toBe(2400);
    expect(calculateNetCogsAfterReturns(1000, 1500)).toBe(0);
  });
});
