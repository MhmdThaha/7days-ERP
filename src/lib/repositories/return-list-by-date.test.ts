import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const getMock = vi.fn();

vi.mock('@/lib/repositories/base.repository', () => ({
  getOrgCollection: () => ({
    where: () => ({
      where: () => ({
        where: () => ({
          get: getMock,
        }),
      }),
    }),
  }),
  getFirestore: vi.fn(),
  buildAuditFields: vi.fn(),
}));

vi.mock('@/lib/repositories/inventory.repository', () => ({
  inventoryRepository: {},
}));

import { returnRepository } from '@/lib/repositories/return.repository';

describe('returnRepository.listCompletedByDate', () => {
  it('queries completed returns for the exact calendar date', async () => {
    getMock.mockResolvedValue({
      docs: [
        {
          id: 'ret-1',
          data: () => ({
            organizationId: 'org-1',
            returnNumber: 'RET-001',
            returnDate: '2026-08-13',
            reason: 'damaged',
            status: 'completed',
            sourceSaleId: null,
            sourceSaleNumberSnapshot: null,
            lines: [],
            lineCount: 0,
            totalUnits: 3,
            notes: null,
            createdAt: { toDate: () => new Date('2026-08-13T11:00:00.000Z') },
            createdBy: 'user-1',
            updatedAt: { toDate: () => new Date('2026-08-13T11:00:00.000Z') },
            updatedBy: 'user-1',
            completedAt: { toDate: () => new Date('2026-08-13T11:00:00.000Z') },
            completedBy: 'user-1',
            deletedAt: null,
            deletedBy: null,
          }),
        },
      ],
    });

    const items = await returnRepository.listCompletedByDate('org-1', '2026-08-13');

    expect(getMock).toHaveBeenCalledOnce();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'ret-1',
      returnNumber: 'RET-001',
      returnDate: '2026-08-13',
      totalUnits: 3,
      status: 'completed',
    });
  });
});
