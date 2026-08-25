import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const scheduleRecalculationAfterCommitMock = vi.fn();

vi.mock('@/lib/repositories/return.repository', () => ({
  returnRepository: {
    getById: vi.fn(),
    complete: vi.fn(),
  },
}));

vi.mock('@/lib/services/daily-summary.service', () => ({
  dailySummaryService: {
    scheduleRecalculationAfterCommit: (...args: unknown[]) =>
      scheduleRecalculationAfterCommitMock(...args),
  },
}));

import { returnRepository } from '@/lib/repositories/return.repository';
import { returnService } from '@/lib/services/return.service';
import type { ReturnEntry } from '@/types/return';

const draftReturn: ReturnEntry = {
  id: 'ret-1',
  organizationId: 'org-1',
  returnNumber: 'RET-001',
  returnDate: '2026-08-13',
  reason: 'unsold',
  status: 'draft',
  sourceSaleId: 'sale-1',
  sourceSaleNumberSnapshot: 'SAL-001',
  lines: [
    {
      id: 'rl-1',
      saleLineId: 'sl-1',
      productId: 'bread',
      productNameSnapshot: 'Bread',
      productCodeSnapshot: 'BRD',
      quantity: 4,
      unit: 'pcs',
      sellingPriceSnapshot: 500,
      unitCostSnapshot: 400,
    },
  ],
  lineCount: 1,
  totalUnits: 4,
  notes: null,
  createdAt: new Date(),
  createdBy: 'u1',
  updatedAt: new Date(),
  updatedBy: 'u1',
  completedAt: null,
  completedBy: null,
  deletedAt: null,
  deletedBy: null,
};

describe('returnService.complete summary integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scheduleRecalculationAfterCommitMock.mockResolvedValue(undefined);
    vi.mocked(returnRepository.getById).mockResolvedValue(draftReturn);
    vi.mocked(returnRepository.complete).mockResolvedValue({
      ...draftReturn,
      status: 'completed',
      completedAt: new Date(),
      completedBy: 'u1',
    });
  });

  it('schedules daily summary recalculation after return completion commits', async () => {
    await returnService.complete('org-1', 'ret-1', 'u1');

    expect(scheduleRecalculationAfterCommitMock).toHaveBeenCalledWith('org-1', '2026-08-13');
  });
});
