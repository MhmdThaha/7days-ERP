import { describe, expect, it, vi } from 'vitest';

import {
  invalidateDailyReportQueries,
  invalidateDashboardQueries,
  invalidateInventoryStockQueries,
  invalidateInventoryStockQueriesForItemType,
  invalidateProductStockQueries,
  invalidateRawMaterialStockQueries,
} from '@/lib/utils/query-invalidation';

describe('query invalidation mapping for today views', () => {
  it('invalidates home dashboard with the canonical dashboard key', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryClient = { invalidateQueries } as never;

    await invalidateDashboardQueries(queryClient);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
  });

  it('invalidates both Today\'s Report and Kitchen Dashboard prefix keys', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryClient = { invalidateQueries } as never;

    await invalidateDailyReportQueries(queryClient);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['daily-report'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['daily-summary-dashboard'] });
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
  });
});

describe('inventory stock query invalidation', () => {
  it('invalidates all raw-material stock query prefixes', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryClient = { invalidateQueries } as never;

    await invalidateRawMaterialStockQueries(queryClient);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['raw-materials'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['raw-materials-by-ids'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['raw-material'] });
    expect(invalidateQueries).toHaveBeenCalledTimes(3);
  });

  it('invalidates all finished-product stock query prefixes', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryClient = { invalidateQueries } as never;

    await invalidateProductStockQueries(queryClient);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['products'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['product'] });
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
  });

  it('invalidates raw material, product, and stock overview caches together', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryClient = { invalidateQueries } as never;

    await invalidateInventoryStockQueries(queryClient);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['raw-materials'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['raw-materials-by-ids'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['raw-material'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['products'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['product'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['stock-overview'] });
    expect(invalidateQueries).toHaveBeenCalledTimes(6);
  });

  it('invalidates raw-material caches after a raw-material adjustment', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryClient = { invalidateQueries } as never;

    await invalidateInventoryStockQueriesForItemType(queryClient, 'raw_material');

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['raw-materials'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['raw-materials-by-ids'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['stock-overview'] });
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['products'] });
  });

  it('invalidates product caches after a finished-product adjustment', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryClient = { invalidateQueries } as never;

    await invalidateInventoryStockQueriesForItemType(queryClient, 'finished_product');

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['products'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['product'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['stock-overview'] });
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['raw-materials-by-ids'] });
  });
});
