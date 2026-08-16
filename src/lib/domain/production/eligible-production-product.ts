import type { ProductListItem } from '@/types/product';

/**
 * Production picker eligibility: active product with an active-recipe pointer.
 * Recipe existence and product match are still validated at draft save.
 */
export function isEligibleProductionProduct(product: ProductListItem): boolean {
  return Boolean(product.isActive && product.activeRecipeId);
}
