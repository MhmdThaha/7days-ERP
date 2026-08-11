import 'server-only';

import type { ProductResolutionCatalogItem } from '@/lib/import/resolution/types';
import { productRepository } from '@/lib/repositories/product.repository';

export type ProductCatalogForReview = {
  catalogItems: ProductResolutionCatalogItem[];
  stockByProductId: Record<string, number>;
};

/**
 * Loads the BakeryOS product catalog once for import review / resolution.
 * Read-only — no writes.
 */
export async function loadProductCatalogForReview(orgId: string): Promise<ProductCatalogForReview> {
  const result = await productRepository.list(orgId, {
    status: 'all',
    page: 1,
    pageSize: 10_000,
  });

  const catalogItems: ProductResolutionCatalogItem[] = result.items.map((product) => ({
    id: product.id,
    name: product.name,
    code: product.code,
    unit: product.unit,
    isActive: product.isActive,
    deletedAt: null,
    category: product.category,
  }));

  const stockByProductId: Record<string, number> = Object.fromEntries(
    result.items.map((product) => [product.id, product.currentStock]),
  );

  return { catalogItems, stockByProductId };
}
