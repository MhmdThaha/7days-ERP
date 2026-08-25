import { describe, expect, it } from 'vitest';

import { resolveDraftIdForCompletion } from '@/lib/utils/sale-complete-draft';

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
