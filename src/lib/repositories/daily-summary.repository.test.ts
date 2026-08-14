import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const getMock = vi.fn();
const updateMock = vi.fn();
const transactionGetMock = vi.fn();
const transactionSetMock = vi.fn();

vi.mock('@/lib/repositories/base.repository', () => ({
  getFirestore: () => ({
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: transactionGetMock,
        set: transactionSetMock,
      }),
  }),
  getOrgCollection: () => ({
    doc: () => ({
      get: getMock,
      update: updateMock,
      path: 'organizations/org-1/dailySummaries/2026-08-13',
    }),
  }),
}));

import {
  DailySummaryVersionConflictError,
  dailySummaryRepository,
} from '@/lib/repositories/daily-summary.repository';

const writeInput = {
  organizationId: 'org-1',
  summaryDate: '2026-08-13',
  totalProductionUnits: 0,
  totalProductionCost: 0,
  totalSalesRevenue: 100,
  totalSalesDiscount: 0,
  totalNetSales: 100,
  totalCogs: 40,
  transactionCount: 1,
  totalPurchases: 0,
  totalExpenses: 0,
  expensesByCategory: {},
  totalWastageCost: 0,
  wastageCount: 0,
  grossProfit: 60,
  netProfit: 60,
};

beforeEach(() => {
  getMock.mockReset();
  updateMock.mockReset();
  transactionGetMock.mockReset();
  transactionSetMock.mockReset();
});

describe('dailySummaryRepository.markNeedsRecalculation', () => {
  it('no-ops when the summary document does not exist', async () => {
    getMock.mockResolvedValue({ exists: false });

    await dailySummaryRepository.markNeedsRecalculation('org-1', '2026-08-13');

    expect(updateMock).not.toHaveBeenCalled();
  });

  it('sets needsRecalculation on an existing summary document', async () => {
    getMock.mockResolvedValue({ exists: true });
    updateMock.mockResolvedValue(undefined);

    await dailySummaryRepository.markNeedsRecalculation('org-1', '2026-08-13');

    expect(updateMock).toHaveBeenCalledWith({ needsRecalculation: true });
  });
});

describe('dailySummaryRepository.upsertIfVersionMatches', () => {
  it('writes when the document version matches the expected version', async () => {
    transactionGetMock.mockResolvedValue({
      exists: true,
      data: () => ({
        version: 2,
        isClosed: false,
        closedAt: null,
        closedBy: null,
      }),
    });

    const result = await dailySummaryRepository.upsertIfVersionMatches(
      'org-1',
      writeInput,
      2,
    );

    expect(transactionSetMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        version: 3,
        needsRecalculation: false,
        totalNetSales: 100,
      }),
    );
    expect(result.version).toBe(3);
    expect(result.needsRecalculation).toBe(false);
  });

  it('B: does not overwrite when a newer version is already present', async () => {
    transactionGetMock.mockResolvedValue({
      exists: true,
      data: () => ({
        version: 5,
        isClosed: false,
        closedAt: null,
        closedBy: null,
        totalNetSales: 999,
      }),
    });

    await expect(
      dailySummaryRepository.upsertIfVersionMatches('org-1', writeInput, 4),
    ).rejects.toBeInstanceOf(DailySummaryVersionConflictError);

    expect(transactionSetMock).not.toHaveBeenCalled();
  });

  it('treats a missing document as version 0', async () => {
    transactionGetMock.mockResolvedValue({ exists: false });

    const result = await dailySummaryRepository.upsertIfVersionMatches(
      'org-1',
      writeInput,
      0,
    );

    expect(transactionSetMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ version: 1, needsRecalculation: false }),
    );
    expect(result.version).toBe(1);
  });
});
