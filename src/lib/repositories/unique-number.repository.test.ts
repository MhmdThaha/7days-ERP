import { describe, expect, it, vi } from 'vitest';

import { DomainError } from '@/lib/domain/errors';

vi.mock('@/lib/repositories/base.repository', () => ({
  getOrgCollection: vi.fn(() => ({
    doc: (id: string) => ({ id, path: `organizations/org-1/uniqueNumbers/${id}` }),
  })),
}));

import { reserveUniqueNumberInTransaction } from '@/lib/repositories/unique-number.repository';

describe('reserveUniqueNumberInTransaction', () => {
  it('reserves a number when the lock doc is free', async () => {
    const transaction = {
      get: vi.fn().mockResolvedValue({ exists: false }),
      set: vi.fn(),
    };

    await reserveUniqueNumberInTransaction(
      transaction as never,
      'org-1',
      'sale',
      'sal-001',
      'sale-doc-1',
    );

    expect(transaction.get).toHaveBeenCalledOnce();
    expect(transaction.set).toHaveBeenCalledOnce();
    expect(transaction.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: 'sale',
        number: 'SAL-001',
        documentId: 'sale-doc-1',
      }),
    );
  });

  it('throws when the number is already reserved', async () => {
    const transaction = {
      get: vi.fn().mockResolvedValue({ exists: true }),
      set: vi.fn(),
    };

    await expect(
      reserveUniqueNumberInTransaction(
        transaction as never,
        'org-1',
        'purchase',
        'PUR-002',
        'purchase-doc-1',
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Purchase number already exists',
    });

    expect(transaction.set).not.toHaveBeenCalled();
  });

  it('normalizes numbers before reserving', async () => {
    const transaction = {
      get: vi.fn().mockResolvedValue({ exists: false }),
      set: vi.fn(),
    };

    await reserveUniqueNumberInTransaction(
      transaction as never,
      'org-1',
      'production',
      ' prd-010 ',
      'production-doc-1',
    );

    expect(transaction.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ number: 'PRD-010' }),
    );
  });
});
