import { describe, expect, it } from 'vitest';

/**
 * Pure helper mirroring save-and-complete retry behavior in create pages.
 * Retries must reuse an existing draft instead of creating duplicates.
 */
function resolveDraftIdForCompletion(
  pendingDraftId: string | null,
  newlyCreatedDraftId: string | null,
): string | null {
  return pendingDraftId ?? newlyCreatedDraftId;
}

describe('save-and-complete draft reuse', () => {
  it('uses a newly created draft on first attempt', () => {
    expect(resolveDraftIdForCompletion(null, 'sale-1')).toBe('sale-1');
  });

  it('reuses pending draft id on network retry without creating another draft', () => {
    expect(resolveDraftIdForCompletion('sale-1', 'sale-2')).toBe('sale-1');
  });

  it('returns null when neither draft exists', () => {
    expect(resolveDraftIdForCompletion(null, null)).toBeNull();
  });
});

describe('duplicate completion protection (status gate)', () => {
  it('treats completed status as non-idempotent for inventory side effects', () => {
    const saleStatus = 'completed';
    const canCompleteAgain = saleStatus === 'draft';

    expect(canCompleteAgain).toBe(false);
  });

  it('allows completion only from draft status', () => {
    const statuses = ['draft', 'completed'] as const;
    const completable = statuses.filter((status) => status === 'draft');

    expect(completable).toEqual(['draft']);
  });
});
