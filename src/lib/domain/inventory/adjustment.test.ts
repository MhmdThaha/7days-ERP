import { describe, expect, it } from 'vitest';

import { planInventoryAdjustment, previewPhysicalCountChange } from '@/lib/domain/inventory/adjustment';

describe('previewPhysicalCountChange', () => {
  it('plans an OUT from 50 to 47', () => {
    expect(previewPhysicalCountChange({ currentStock: 50, physicalCount: 47 })).toEqual({
      quantityDifference: -3,
      quantityAfter: 47,
    });
  });

  it('plans an IN from 20 to 25', () => {
    expect(previewPhysicalCountChange({ currentStock: 20, physicalCount: 25 })).toEqual({
      quantityDifference: 5,
      quantityAfter: 25,
    });
  });

  it('rejects a zero difference', () => {
    expect(() => previewPhysicalCountChange({ currentStock: 50, physicalCount: 50 })).toThrow(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: 'Physical count matches current stock. Nothing to adjust.',
      }),
    );
  });

  it('rejects a negative physical count', () => {
    expect(() => previewPhysicalCountChange({ currentStock: 10, physicalCount: -1 })).toThrow(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: 'Physical count cannot be negative.',
      }),
    );
  });
});

describe('planInventoryAdjustment', () => {
  it('preserves average cost on OUT', () => {
    const plan = planInventoryAdjustment({
      currentStock: 50,
      averageCost: 4000,
      physicalCount: 47,
      itemName: 'Maida',
    });

    expect(plan).toMatchObject({
      movementType: 'ADJUSTMENT_OUT',
      movementQuantity: 3,
      quantityDifference: -3,
      unitCost: 4000,
      totalCost: 12000,
      averageCostAfter: 4000,
    });
  });

  it('uses existing average cost on IN', () => {
    const plan = planInventoryAdjustment({
      currentStock: 20,
      averageCost: 4000,
      physicalCount: 25,
      itemName: 'Sugar',
    });

    expect(plan).toMatchObject({
      movementType: 'ADJUSTMENT_IN',
      movementQuantity: 5,
      quantityDifference: 5,
      unitCost: 4000,
      totalCost: 20000,
      averageCostAfter: 4000,
    });
  });

  it('rejects zero-cost IN when stock and average cost are both zero', () => {
    expect(() =>
      planInventoryAdjustment({
        currentStock: 0,
        averageCost: 0,
        physicalCount: 5,
        itemName: 'Sugar',
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: 'Cannot add stock for "Sugar" because it has no cost yet. Record a purchase first.',
      }),
    );
  });
});
