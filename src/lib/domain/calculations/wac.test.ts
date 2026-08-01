import { describe, expect, it } from 'vitest';

import { calculateNewWac } from '@/lib/domain/calculations/wac';

describe('calculateNewWac', () => {
  it('uses the incoming unit cost when there is no existing stock', () => {
    const result = calculateNewWac(0, 0, 1000, 34);

    expect(result.newQty).toBe(1000);
    expect(result.newAvgCost).toBe(34);
  });

  it('uses the incoming unit cost when existing stock is negative', () => {
    const result = calculateNewWac(-5, 12, 100, 20);

    expect(result.newQty).toBe(95);
    expect(result.newAvgCost).toBe(20);
  });

  it('keeps the existing average cost when incoming quantity is zero or negative', () => {
    const result = calculateNewWac(500, 3.2, 0, 999);

    expect(result.newQty).toBe(500);
    expect(result.newAvgCost).toBe(3.2);
  });

  it('blends integer-paise costs exactly as before the precision change', () => {
    // 100 units @ 10p + 100 units @ 20p → 200 units @ 15p
    const result = calculateNewWac(100, 10, 100, 20);

    expect(result.newQty).toBe(200);
    expect(result.newAvgCost).toBe(15);
  });

  it('preserves fractional-paise rates instead of rounding to integer paise', () => {
    // 1000 g in stock @ 3p/g, incoming 1000 g @ 3.4p/g → true blend 3.2p/g
    const result = calculateNewWac(1000, 3, 1000, 3.4);

    expect(result.newQty).toBe(2000);
    expect(result.newAvgCost).toBe(3.2);
  });

  it('keeps a decimal incoming rate exact on first purchase', () => {
    // 1000 g pack at ₹335 → 33.5 paise per gram
    const result = calculateNewWac(0, 0, 1000, 33.5);

    expect(result.newAvgCost).toBe(33.5);
  });

  it('rounds the blended rate to 4 decimal places to suppress float drift', () => {
    // 3 units @ 10p + 1 unit @ 20p → 12.5p exact; 1/3-style blends round to 4dp
    const uneven = calculateNewWac(1, 10, 2, 15);

    expect(uneven.newQty).toBe(3);
    expect(uneven.newAvgCost).toBeCloseTo(13.3333, 4);
    expect(uneven.newAvgCost).toBe(Math.round(uneven.newAvgCost * 10000) / 10000);
  });

  it('does not drift across repeated updates', () => {
    let qty = 0;
    let avg = 0;

    for (let i = 0; i < 1000; i += 1) {
      const result = calculateNewWac(qty, avg, 10, 3.4);
      qty = result.newQty;
      avg = result.newAvgCost;
    }

    expect(qty).toBe(10000);
    expect(avg).toBeCloseTo(3.4, 4);
  });

  it('produces integer money when consumed with Math.round like sale COGS does', () => {
    const { newAvgCost } = calculateNewWac(1000, 3, 1000, 3.4);
    const cogs = Math.round(150 * newAvgCost);

    expect(Number.isInteger(cogs)).toBe(true);
    expect(cogs).toBe(480);
  });
});
