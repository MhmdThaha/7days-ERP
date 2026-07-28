import { DomainError } from '@/lib/domain/errors';

/**
 * Ensures an inventory deduction would not drive stock below zero.
 * Used by inventory-affecting completion flows (sales, production, wastage).
 */
export function assertSufficientStock(
  availableQty: number,
  requiredQty: number,
  itemName: string,
): void {
  const nextQty = availableQty - requiredQty;

  if (nextQty < 0) {
    throw new DomainError(
      'VALIDATION_ERROR',
      `Insufficient stock for "${itemName}". Available: ${availableQty}, required: ${requiredQty}`,
    );
  }
}
