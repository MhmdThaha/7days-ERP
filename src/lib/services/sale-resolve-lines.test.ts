import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainError } from '@/lib/domain/errors';
import { productRepository } from '@/lib/repositories/product.repository';
import { saleRepository } from '@/lib/repositories/sale.repository';
import { saleService } from '@/lib/services/sale.service';
import type { Product } from '@/types/product';
import type { Sale } from '@/types/sale';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/repositories/sale.repository', () => ({
  saleRepository: {
    create: vi.fn(),
    findBySaleNumber: vi.fn(),
  },
  generateSaleLineId: vi.fn((() => {
    let n = 0;
    return () => `sline-${++n}`;
  })()),
}));

vi.mock('@/lib/repositories/product.repository', () => ({
  productRepository: {
    getById: vi.fn(),
    getByIds: vi.fn(),
  },
}));

vi.mock('@/lib/services/daily-summary.service', () => ({
  dailySummaryService: {
    scheduleRecalculationAfterCommit: vi.fn(),
  },
}));

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p-1',
    organizationId: 'org-a',
    code: 'BRD-001',
    name: 'Milk Bread',
    category: 'Bread',
    unit: 'pcs',
    sellingPrice: 4500,
    description: null,
    isActive: true,
    currentStock: 100,
    averageCost: 3000,
    activeRecipeId: null,
    imageUrl: null,
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    createdBy: 'user-1',
    updatedAt: new Date('2026-08-16T00:00:00.000Z'),
    updatedBy: 'user-1',
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

function draftSale(lines: Sale['lines']): Sale {
  return {
    id: 'sale-1',
    organizationId: 'org-a',
    saleNumber: 'SAL-001',
    saleDate: '2026-08-16',
    customerId: null,
    customerNameSnapshot: null,
    status: 'draft',
    lines,
    subtotal: lines.reduce((sum, line) => sum + line.lineTotal, 0),
    totalCogs: 0,
    lineCount: lines.length,
    notes: null,
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    createdBy: 'user-1',
    updatedAt: new Date('2026-08-16T00:00:00.000Z'),
    updatedBy: 'user-1',
    completedAt: null,
    completedBy: null,
    deletedAt: null,
    deletedBy: null,
  };
}

describe('saleService.create product reads', () => {
  beforeEach(() => {
    vi.mocked(productRepository.getById).mockReset();
    vi.mocked(productRepository.getByIds).mockReset();
    vi.mocked(saleRepository.create).mockReset();
    vi.mocked(saleRepository.findBySaleNumber).mockReset();
    vi.mocked(saleRepository.findBySaleNumber).mockResolvedValue(null);
    vi.mocked(saleRepository.create).mockImplementation(async (_orgId, input) =>
      draftSale(
        input.lines.map((line, index) => ({
          ...line,
          id: line.id ?? `sline-${index + 1}`,
        })),
      ),
    );
  });

  it('loads unique products once via getByIds and does not call getById', async () => {
    vi.mocked(productRepository.getByIds).mockResolvedValue([product()]);

    const created = await saleService.create(
      'org-a',
      {
        saleDate: '2026-08-16',
        lines: [{ productId: 'p-1', quantity: 2, sellingPrice: 4500 }],
      },
      'user-1',
    );

    expect(productRepository.getByIds).toHaveBeenCalledTimes(1);
    expect(productRepository.getByIds).toHaveBeenCalledWith('org-a', ['p-1']);
    expect(productRepository.getById).not.toHaveBeenCalled();
    expect(created.lines[0]).toMatchObject({
      productId: 'p-1',
      productNameSnapshot: 'Milk Bread',
      productCodeSnapshot: 'BRD-001',
      sellingPriceSnapshot: 4500,
      quantity: 2,
      unit: 'pcs',
      lineTotal: 9000,
      unitCost: 0,
      cogs: 0,
    });
  });

  it('batches two distinct products in one getByIds call', async () => {
    vi.mocked(productRepository.getByIds).mockResolvedValue([
      product({ id: 'p-1' }),
      product({ id: 'p-2', code: 'CKE-010', name: 'Cake', sellingPrice: 12000 }),
    ]);

    await saleService.create(
      'org-a',
      {
        saleDate: '2026-08-16',
        lines: [
          { productId: 'p-1', quantity: 1, sellingPrice: 4500 },
          { productId: 'p-2', quantity: 1, sellingPrice: 12000 },
        ],
      },
      'user-1',
    );

    expect(productRepository.getByIds).toHaveBeenCalledTimes(1);
    expect(productRepository.getByIds).toHaveBeenCalledWith('org-a', ['p-1', 'p-2']);
    expect(productRepository.getById).not.toHaveBeenCalled();
  });

  it('reads a repeated product id only once', async () => {
    vi.mocked(productRepository.getByIds).mockResolvedValue([product()]);

    await saleService.create(
      'org-a',
      {
        saleDate: '2026-08-16',
        lines: [
          { productId: 'p-1', quantity: 1, sellingPrice: 4500 },
          { productId: 'p-1', quantity: 3, sellingPrice: 4500 },
        ],
      },
      'user-1',
    );

    expect(productRepository.getByIds).toHaveBeenCalledWith('org-a', ['p-1']);
    expect(productRepository.getByIds).toHaveBeenCalledTimes(1);
    expect(productRepository.getById).not.toHaveBeenCalled();
  });

  it('keeps the imported selling price instead of catalog sellingPrice', async () => {
    vi.mocked(productRepository.getByIds).mockResolvedValue([product({ sellingPrice: 9999 })]);

    const created = await saleService.create(
      'org-a',
      {
        saleDate: '2026-08-16',
        lines: [{ productId: 'p-1', quantity: 1, sellingPrice: 4500 }],
      },
      'user-1',
    );

    expect(created.lines[0]?.sellingPriceSnapshot).toBe(4500);
    expect(created.lines[0]?.lineTotal).toBe(4500);
  });

  it('throws NOT_FOUND when a product is missing from the org-scoped batch', async () => {
    vi.mocked(productRepository.getByIds).mockResolvedValue([]);

    await expect(
      saleService.create(
        'org-a',
        {
          saleDate: '2026-08-16',
          lines: [{ productId: 'missing', quantity: 1, sellingPrice: 4500 }],
        },
        'user-1',
      ),
    ).rejects.toMatchObject({
      name: DomainError.name,
      code: 'NOT_FOUND',
    });
    expect(saleRepository.create).not.toHaveBeenCalled();
  });

  it('throws VALIDATION_ERROR when a product is inactive', async () => {
    vi.mocked(productRepository.getByIds).mockResolvedValue([
      product({ isActive: false, name: 'Old Bread' }),
    ]);

    await expect(
      saleService.create(
        'org-a',
        {
          saleDate: '2026-08-16',
          lines: [{ productId: 'p-1', quantity: 1, sellingPrice: 4500 }],
        },
        'user-1',
      ),
    ).rejects.toMatchObject({
      name: DomainError.name,
      code: 'VALIDATION_ERROR',
      message: 'Product "Old Bread" is inactive',
    });
  });

  it('skips the pre-transaction sale-number lookup when importSource is present', async () => {
    vi.mocked(productRepository.getByIds).mockResolvedValue([product()]);
    vi.mocked(saleRepository.findBySaleNumber).mockResolvedValue(draftSale([]));

    await saleService.create(
      'org-a',
      {
        saleNumber: 'INV-99',
        saleDate: '2026-08-16',
        lines: [{ productId: 'p-1', quantity: 1, sellingPrice: 4500 }],
      },
      'user-1',
      { importSource: { importId: 'imp-1', groupKey: 'number:INV-99' } },
    );

    expect(saleRepository.findBySaleNumber).not.toHaveBeenCalled();
    expect(saleRepository.create).toHaveBeenCalledWith(
      'org-a',
      expect.objectContaining({
        saleNumber: 'INV-99',
        importSource: { importId: 'imp-1', groupKey: 'number:INV-99' },
      }),
      'user-1',
    );
  });
});
