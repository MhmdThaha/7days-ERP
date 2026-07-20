import { PRODUCT_LOW_STOCK_THRESHOLD } from '@/lib/domain/constants/dashboard';

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export function isNegativeStock(currentStock: number): boolean {
  return currentStock < 0;
}

export function isOutOfStock(currentStock: number): boolean {
  return currentStock <= 0;
}

export function isProductLowStock(currentStock: number): boolean {
  return currentStock <= PRODUCT_LOW_STOCK_THRESHOLD;
}

export function isRawMaterialLowStock(
  currentStock: number,
  reorderLevel: number | null,
): boolean {
  if (reorderLevel === null) {
    return false;
  }

  return currentStock <= reorderLevel;
}

export function getProductStockStatus(currentStock: number): StockStatus {
  if (isOutOfStock(currentStock)) {
    return 'out_of_stock';
  }

  if (isProductLowStock(currentStock)) {
    return 'low_stock';
  }

  return 'in_stock';
}

export function getRawMaterialStockStatus(
  currentStock: number,
  reorderLevel: number | null,
): StockStatus {
  if (isOutOfStock(currentStock)) {
    return 'out_of_stock';
  }

  if (isRawMaterialLowStock(currentStock, reorderLevel)) {
    return 'low_stock';
  }

  return 'in_stock';
}

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  in_stock: 'In Stock',
  low_stock: 'Low Stock',
  out_of_stock: 'Out of Stock',
};
