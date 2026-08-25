import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const scheduleRecalculationAfterCommitMock = vi.fn();

vi.mock('@/lib/repositories/return.repository', () => ({
  generateReturnLineId: vi.fn(() => 'rl-generated'),
  returnRepository: {
    getById: vi.fn(),
    complete: vi.fn(),
    listBySourceSaleId: vi.fn(),
    getHighestReturnNumber: vi.fn(),
    findByReturnNumber: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/sale.repository', () => ({
  saleRepository: {
    getById: vi.fn(),
  },
}));

vi.mock('@/lib/services/daily-summary.service', () => ({
  dailySummaryService: {
    scheduleRecalculationAfterCommit: (...args: unknown[]) =>
      scheduleRecalculationAfterCommitMock(...args),
  },
}));

import { returnRepository } from '@/lib/repositories/return.repository';
import { saleRepository } from '@/lib/repositories/sale.repository';
import { returnService } from '@/lib/services/return.service';
import type { ReturnEntry } from '@/types/return';
import type { Sale } from '@/types/sale';

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

const completedSale: Sale = {
  id: 'sale-100',
  organizationId: 'org-1',
  saleNumber: 'SAL-100',
  saleDate: '2026-08-10',
  customerId: null,
  customerNameSnapshot: 'Walk-in',
  status: 'completed',
  lines: [
    {
      id: 'sl-kuboos',
      productId: 'kuboos',
      productNameSnapshot: 'Kuboos',
      productCodeSnapshot: 'KUB',
      sellingPriceSnapshot: 4000,
      quantity: 10,
      unit: 'pcs',
      lineTotal: 40000,
      unitCost: 2500,
      cogs: 25000,
    },
    {
      id: 'sl-bread',
      productId: 'bread',
      productNameSnapshot: 'Bread',
      productCodeSnapshot: 'BRD',
      sellingPriceSnapshot: 500,
      quantity: 5,
      unit: 'pcs',
      lineTotal: 2500,
      unitCost: 400,
      cogs: 2000,
    },
  ],
  subtotal: 42500,
  totalCogs: 27000,
  lineCount: 2,
  notes: null,
  createdAt: new Date(),
  createdBy: 'u1',
  updatedAt: new Date(),
  updatedBy: 'u1',
  completedAt: new Date(),
  completedBy: 'u1',
  deletedAt: null,
  deletedBy: null,
};

function completedReturnLine(
  saleLineId: string,
  quantity: number,
  productId: string,
): ReturnEntry['lines'][number] {
  return {
    id: `rl-${saleLineId}`,
    saleLineId,
    productId,
    productNameSnapshot: productId,
    productCodeSnapshot: productId.toUpperCase(),
    quantity,
    unit: 'pcs',
    sellingPriceSnapshot: 4000,
    unitCostSnapshot: 2500,
  };
}

describe('returnService sale-linked validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saleRepository.getById).mockResolvedValue(completedSale);
    vi.mocked(returnRepository.listBySourceSaleId).mockResolvedValue([]);
    vi.mocked(returnRepository.getHighestReturnNumber).mockResolvedValue(0);
    vi.mocked(returnRepository.findByReturnNumber).mockResolvedValue(null);
    vi.mocked(returnRepository.create).mockImplementation(async (_orgId, input) => ({
      id: 'ret-new',
      organizationId: 'org-1',
      returnNumber: input.returnNumber,
      returnDate: input.returnDate,
      reason: input.reason,
      status: 'draft',
      sourceSaleId: input.sourceSaleId,
      sourceSaleNumberSnapshot: input.sourceSaleNumberSnapshot,
      lines: input.lines,
      lineCount: input.lines.length,
      totalUnits: input.totalUnits,
      notes: input.notes ?? null,
      createdAt: new Date(),
      createdBy: 'u1',
      updatedAt: new Date(),
      updatedBy: 'u1',
      completedAt: null,
      completedBy: null,
      deletedAt: null,
      deletedBy: null,
    }));
  });

  it('creates a linked return with sale-line snapshots', async () => {
    const result = await returnService.create(
      'org-1',
      {
        sourceSaleId: 'sale-100',
        returnDate: '2026-08-24',
        reason: 'unsold',
        lines: [{ saleLineId: 'sl-kuboos', quantity: 3 }],
      },
      'u1',
    );

    expect(result.sourceSaleId).toBe('sale-100');
    expect(result.lines[0]).toMatchObject({
      saleLineId: 'sl-kuboos',
      sellingPriceSnapshot: 4000,
      unitCostSnapshot: 2500,
    });
  });

  it('rejects over-return against remaining quantity', async () => {
    vi.mocked(returnRepository.listBySourceSaleId).mockResolvedValue([
      {
        id: 'ret-1',
        organizationId: 'org-1',
        returnNumber: 'RET-001',
        returnDate: '2026-08-20',
        reason: 'unsold',
        status: 'completed',
        sourceSaleId: 'sale-100',
        sourceSaleNumberSnapshot: 'SAL-100',
        lines: [completedReturnLine('sl-kuboos', 7, 'kuboos')],
        lineCount: 1,
        totalUnits: 7,
        notes: null,
        createdAt: new Date(),
        createdBy: 'u1',
        updatedAt: new Date(),
        updatedBy: 'u1',
        completedAt: new Date(),
        completedBy: 'u1',
        deletedAt: null,
        deletedBy: null,
      },
    ]);

    await expect(
      returnService.create(
        'org-1',
        {
          sourceSaleId: 'sale-100',
          returnDate: '2026-08-24',
          reason: 'unsold',
          lines: [{ saleLineId: 'sl-kuboos', quantity: 4 }],
        },
        'u1',
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects nonexistent sale', async () => {
    vi.mocked(saleRepository.getById).mockResolvedValue(null);

    await expect(
      returnService.create(
        'org-1',
        {
          sourceSaleId: 'missing',
          returnDate: '2026-08-24',
          reason: 'unsold',
          lines: [{ saleLineId: 'sl-kuboos', quantity: 1 }],
        },
        'u1',
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects draft sale', async () => {
    vi.mocked(saleRepository.getById).mockResolvedValue({
      ...completedSale,
      status: 'draft',
    });

    await expect(
      returnService.create(
        'org-1',
        {
          sourceSaleId: 'sale-100',
          returnDate: '2026-08-24',
          reason: 'unsold',
          lines: [{ saleLineId: 'sl-kuboos', quantity: 1 }],
        },
        'u1',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects invalid sale line id', async () => {
    await expect(
      returnService.create(
        'org-1',
        {
          sourceSaleId: 'sale-100',
          returnDate: '2026-08-24',
          reason: 'unsold',
          lines: [{ saleLineId: 'sl-missing', quantity: 1 }],
        },
        'u1',
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('supports multiple products in one linked return', async () => {
    const result = await returnService.create(
      'org-1',
      {
        sourceSaleId: 'sale-100',
        returnDate: '2026-08-24',
        reason: 'unsold',
        lines: [
          { saleLineId: 'sl-kuboos', quantity: 3 },
          { saleLineId: 'sl-bread', quantity: 2 },
        ],
      },
      'u1',
    );

    expect(result.lines).toHaveLength(2);
    expect(result.lines.map((line) => line.saleLineId)).toEqual(['sl-kuboos', 'sl-bread']);
  });
});

describe('returnService.getSaleReturnContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saleRepository.getById).mockResolvedValue(completedSale);
    vi.mocked(returnRepository.listBySourceSaleId).mockResolvedValue([]);
  });

  it('reports remaining returnable quantity per sale line', async () => {
    const context = await returnService.getSaleReturnContext('org-1', 'sale-100');

    expect(context.lines[0]).toMatchObject({
      saleLineId: 'sl-kuboos',
      soldQuantity: 10,
      returnedQuantity: 0,
      remainingReturnableQuantity: 10,
    });
    expect(context.hasReturnableQuantity).toBe(true);
  });
});
