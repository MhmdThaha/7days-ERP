import { PRODUCTION_NUMBER_PREFIX } from '@/lib/domain/constants/production';
import { DomainError } from '@/lib/domain/errors';

/** Matches historical formatting: PRD-001, PRD-002, … PRD-1000, etc. */
export function formatProductionNumber(sequence: number): string {
  return `${PRODUCTION_NUMBER_PREFIX}-${String(sequence).padStart(3, '0')}`;
}

export function parseProductionNumberSequence(productionNumber: string): number | null {
  const match = /^PRD-(\d+)$/i.exec(productionNumber.trim());

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
export function findNextFreeProductionSequence(
  lastValue: number,
  isReserved: (sequence: number) => boolean,
  maxAttempts = 1000,
): { sequence: number; productionNumber: string } {
  const start = Number.isFinite(lastValue) && lastValue > 0 ? Math.floor(lastValue) : 0;
  let next = start + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!isReserved(next)) {
      return { sequence: next, productionNumber: formatProductionNumber(next) };
    }

    next += 1;
  }

  throw new DomainError('VALIDATION_ERROR', 'Unable to allocate production number');
}
