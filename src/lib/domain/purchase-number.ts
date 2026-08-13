import { PURCHASE_NUMBER_PREFIX } from '@/lib/domain/constants/purchase';
import { DomainError } from '@/lib/domain/errors';

/** Matches historical formatting: PUR-001, PUR-002, … PUR-1000, etc. */
export function formatPurchaseNumber(sequence: number): string {
  return `${PURCHASE_NUMBER_PREFIX}-${String(sequence).padStart(3, '0')}`;
}

export function parsePurchaseNumberSequence(purchaseNumber: string): number | null {
  const match = /^PUR-(\d+)$/i.exec(purchaseNumber.trim());

  if (!match?.[1]) {
    return null;
  }

  const value = Number.parseInt(match[1], 10);
  return Number.isNaN(value) ? null : value;
}

/**
 * Finds the next free sequence after `lastValue`, skipping numbers already reserved.
 * Used so soft-deleted purchases (lock retained) do not collide with a new draft.
 */
export function findNextFreePurchaseSequence(
  lastValue: number,
  isReserved: (sequence: number) => boolean,
  maxAttempts = 1000,
): { sequence: number; purchaseNumber: string } {
  const start = Number.isFinite(lastValue) && lastValue > 0 ? Math.floor(lastValue) : 0;
  let next = start + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!isReserved(next)) {
      return { sequence: next, purchaseNumber: formatPurchaseNumber(next) };
    }

    next += 1;
  }

  throw new DomainError('VALIDATION_ERROR', 'Unable to allocate purchase number');
}
