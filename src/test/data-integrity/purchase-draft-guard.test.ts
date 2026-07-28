import { describe, expect, it } from 'vitest';

import { DomainError } from '@/lib/domain/errors';

type PurchaseStatus = 'draft' | 'received';

function assertDraftPurchaseForMutation(status: PurchaseStatus, deletedAt: Date | null): void {
  if (deletedAt) {
    throw new DomainError('NOT_FOUND', 'Purchase not found');
  }

  if (status !== 'draft') {
    throw new DomainError('VALIDATION_ERROR', 'Only draft purchases can be modified');
  }
}

describe('purchase draft mutation guard', () => {
  it('allows updates on draft purchases', () => {
    expect(() => assertDraftPurchaseForMutation('draft', null)).not.toThrow();
  });

  it('blocks updates on received purchases', () => {
    expect(() => assertDraftPurchaseForMutation('received', null)).toThrow(DomainError);
    expect(() => assertDraftPurchaseForMutation('received', null)).toThrow(
      'Only draft purchases can be modified',
    );
  });

  it('blocks updates on soft-deleted purchases', () => {
    expect(() => assertDraftPurchaseForMutation('draft', new Date())).toThrow('Purchase not found');
  });
});
