import type { QueryClient } from '@tanstack/react-query';

import type { InventoryItemType } from '@/types/inventory';

export async function invalidateDashboardQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
}

/**
 * Today's Report (`['daily-report', uid]`) and Kitchen Dashboard
 * (`['daily-summary-dashboard', 'v1', uid]`).
 * Prefix invalidation matches both canonical keys.
 */
export async function invalidateDailyReportQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['daily-report'] }),
    queryClient.invalidateQueries({ queryKey: ['daily-summary-dashboard'] }),
  ]);
}

export async function invalidateMonthlyReportQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ['monthly-report'] });
}

/**
 * Raw-material stock shown in list pages, pickers, and production preview
 * (`useRawMaterialsByIds` → `raw-materials-by-ids`, per-id `raw-material`).
 */
export async function invalidateRawMaterialStockQueries(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['raw-materials'] }),
    queryClient.invalidateQueries({ queryKey: ['raw-materials-by-ids'] }),
    queryClient.invalidateQueries({ queryKey: ['raw-material'] }),
  ]);
}

/**
 * Finished-product stock shown in list pages, pickers, and line forms
 * (`useProductsByIds` → `product`, list `products`).
 */
export async function invalidateProductStockQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['products'] }),
    queryClient.invalidateQueries({ queryKey: ['product'] }),
  ]);
}

/** Inventory overview screen (`stock-overview`). */
export async function invalidateStockOverviewQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ['stock-overview'] });
}

/** Both raw-material and finished-product stock caches plus stock overview. */
export async function invalidateInventoryStockQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    invalidateRawMaterialStockQueries(queryClient),
    invalidateProductStockQueries(queryClient),
    invalidateStockOverviewQueries(queryClient),
  ]);
}

/** Targeted invalidation after a manual inventory adjustment. */
export async function invalidateInventoryStockQueriesForItemType(
  queryClient: QueryClient,
  itemType: InventoryItemType,
): Promise<void> {
  if (itemType === 'raw_material') {
    await Promise.all([
      invalidateRawMaterialStockQueries(queryClient),
      invalidateStockOverviewQueries(queryClient),
    ]);
    return;
  }

  await Promise.all([
    invalidateProductStockQueries(queryClient),
    invalidateStockOverviewQueries(queryClient),
  ]);
}
