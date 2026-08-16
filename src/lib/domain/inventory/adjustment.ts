import { DomainError } from '@/lib/domain/errors';
import type { MovementType } from '@/types/inventory';

export type InventoryAdjustmentPlan = {
  quantityBefore: number;
  quantityAfter: number;
  quantityDifference: number;
  movementType: Extract<MovementType, 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'>;
  movementQuantity: number;
  unitCost: number;
  totalCost: number;
  averageCostAfter: number;
};

export function previewPhysicalCountChange(input: {
  currentStock: number;
  physicalCount: number;
}): { quantityDifference: number; quantityAfter: number } {
  if (!Number.isFinite(input.physicalCount)) {
    throw new DomainError('VALIDATION_ERROR', 'Enter a valid physical count.');
  }

  if (input.physicalCount < 0) {
    throw new DomainError('VALIDATION_ERROR', 'Physical count cannot be negative.');
  }

  const quantityDifference = input.physicalCount - input.currentStock;

  if (quantityDifference === 0) {
    throw new DomainError(
      'VALIDATION_ERROR',
      'Physical count matches current stock. Nothing to adjust.',
    );
  }

  return {
    quantityDifference,
    quantityAfter: input.physicalCount,
  };
}

export function planInventoryAdjustment(input: {
  currentStock: number;
  averageCost: number;
  physicalCount: number;
  itemName: string;
}): InventoryAdjustmentPlan {
  const preview = previewPhysicalCountChange({
    currentStock: input.currentStock,
    physicalCount: input.physicalCount,
  });

  const isIncrease = preview.quantityDifference > 0;

  if (isIncrease && input.currentStock === 0 && input.averageCost === 0) {
    throw new DomainError(
      'VALIDATION_ERROR',
      `Cannot add stock for "${input.itemName}" because it has no cost yet. Record a purchase first.`,
    );
  }

  const movementQuantity = Math.abs(preview.quantityDifference);
  const unitCost = input.averageCost;
  const totalCost = Math.round(movementQuantity * unitCost);

  return {
    quantityBefore: input.currentStock,
    quantityAfter: preview.quantityAfter,
    quantityDifference: preview.quantityDifference,
    movementType: isIncrease ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
    movementQuantity,
    unitCost,
    totalCost,
    averageCostAfter: input.averageCost,
  };
}
