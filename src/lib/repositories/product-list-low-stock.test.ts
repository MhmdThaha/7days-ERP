import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const getMock = vi.fn();
const clauses: Array<{ method: string; args: unknown[] }> = [];

function createQuery() {
  const query = {
    where: (...args: unknown[]) => {
      clauses.push({ method: 'where', args });
      return query;
    },
    orderBy: (...args: unknown[]) => {
      clauses.push({ method: 'orderBy', args });
      return query;
    },
    limit: (...args: unknown[]) => {
      clauses.push({ method: 'limit', args });
      return query;
    },
    get: getMock,
  };

  return query;
}

vi.mock('@/lib/repositories/base.repository', () => ({
  getOrgCollection: () => createQuery(),
  getFirestore: vi.fn(),
  buildAuditFields: vi.fn(),
}));

import { PRODUCT_LOW_STOCK_THRESHOLD } from '@/lib/domain/constants/dashboard';
import { productRepository } from '@/lib/repositories/product.repository';

describe('productRepository.listLowStockActive', () => {
  it('queries active products at or below the low-stock threshold with a limit', async () => {
    clauses.length = 0;
    getMock.mockResolvedValue({
      docs: [
        {
          id: 'prd-neg',
          data: () => ({
            code: 'PRD-002',
            name: 'Croissant',
            currentStock: -2,
            unit: 'pcs',
          }),
        },
        {
          id: 'prd-zero',
          data: () => ({
            code: 'PRD-001',
            name: 'Bread',
            currentStock: 0,
            unit: 'pcs',
          }),
        },
      ],
    });

    const items = await productRepository.listLowStockActive('org-1', 10);

    expect(clauses).toEqual([
      { method: 'where', args: ['deletedAt', '==', null] },
      { method: 'where', args: ['isActive', '==', true] },
      { method: 'where', args: ['currentStock', '<=', PRODUCT_LOW_STOCK_THRESHOLD] },
      { method: 'orderBy', args: ['currentStock'] },
      { method: 'limit', args: [10] },
    ]);
    expect(getMock).toHaveBeenCalledOnce();
    expect(items).toEqual([
      {
        id: 'prd-neg',
        code: 'PRD-002',
        name: 'Croissant',
        currentStock: -2,
        unit: 'pcs',
      },
      {
        id: 'prd-zero',
        code: 'PRD-001',
        name: 'Bread',
        currentStock: 0,
        unit: 'pcs',
      },
    ]);
  });
});
