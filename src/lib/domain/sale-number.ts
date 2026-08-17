import { SALE_NUMBER_PREFIX } from '@/lib/domain/constants/sale';
import { DomainError } from '@/lib/domain/errors';

/** Matches historical formatting: SAL-001, SAL-002, … SAL-1000, etc. */
export function formatSaleNumber(sequence: number): string {
  return `${SALE_NUMBER_PREFIX}-${String(sequence).padStart(3, '0')}`;
}

export function parseSaleNumberSequence(saleNumber: string): number | null {
  const match = /^SAL-(\d+)$/i.exec(saleNumber.trim());

  if (!match?.[1]) {
    return null;
  }

  const value = Number.parseInt(match[1], 10);
  return Number.isNaN(value) ? null : value;
}

/**
 * Finds the next free sequence after `lastValue`, skipping numbers already reserved.
 * Used so uniqueNumbers locks (including soft-deleted drafts) do not collide.
 */
export function findNextFreeSaleSequence(
  lastValue: number,
  isReserved: (sequence: number) => boolean,
  maxAttempts = 1000,
): { sequence: number; saleNumber: string } {
  const start = Number.isFinite(lastValue) && lastValue > 0 ? Math.floor(lastValue) : 0;
  let next = start + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!isReserved(next)) {
      return { sequence: next, saleNumber: formatSaleNumber(next) };
    }

    next += 1;
  }

  throw new DomainError('VALIDATION_ERROR', 'Unable to allocate sale number');
}
