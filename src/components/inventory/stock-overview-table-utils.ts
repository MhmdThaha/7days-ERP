import { isNegativeStock, type StockStatus } from '@/lib/domain/stock-status';
import type {
  StockOverviewAttentionItem,
  StockOverviewProductItem,
  StockOverviewRawMaterialItem,
} from '@/types/stock-overview';

export type StockOverviewStatusFilter = 'all' | 'needs_attention' | 'low_stock' | 'out_of_stock';

function needsAttention(currentStock: number, status: StockStatus): boolean {
  return status !== 'in_stock' || isNegativeStock(currentStock);
}

function severityRank(currentStock: number, status: StockStatus): number {
  if (isNegativeStock(currentStock)) {
    return 0;
  }

  if (status === 'out_of_stock') {
    return 1;
  }

  if (status === 'low_stock') {
    return 2;
  }

  return 3;
}

export function matchesStockSearch(name: string, code: string, search: string): boolean {
  const term = search.trim().toLowerCase();

  if (!term) {
    return true;
  }

  return name.toLowerCase().includes(term) || code.toLowerCase().includes(term);
}

export function matchesStockStatusFilter(
  currentStock: number,
  status: StockStatus,
  filter: StockOverviewStatusFilter,
): boolean {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'needs_attention') {
    return needsAttention(currentStock, status);
  }

  if (filter === 'low_stock') {
    return status === 'low_stock' && !isNegativeStock(currentStock);
  }

  return status === 'out_of_stock' || isNegativeStock(currentStock);
}

export function filterProducts(
  products: StockOverviewProductItem[],
  search: string,
  statusFilter: StockOverviewStatusFilter,
): StockOverviewProductItem[] {
  return products.filter(
    (product) =>
      matchesStockSearch(product.name, product.code, search) &&
      matchesStockStatusFilter(product.currentStock, product.status, statusFilter),
  );
}

export function filterRawMaterials(
  rawMaterials: StockOverviewRawMaterialItem[],
  search: string,
  statusFilter: StockOverviewStatusFilter,
): StockOverviewRawMaterialItem[] {
  return rawMaterials.filter(
    (material) =>
      matchesStockSearch(material.name, material.code, search) &&
      matchesStockStatusFilter(material.currentStock, material.status, statusFilter),
  );
}

export function sortByStockSeverity<
  T extends { currentStock: number; status: StockStatus; name: string },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const rankDiff = severityRank(a.currentStock, a.status) - severityRank(b.currentStock, b.status);

    if (rankDiff !== 0) {
      return rankDiff;
    }

    return a.name.localeCompare(b.name);
  });
}

export function filterAttentionItems(
  items: StockOverviewAttentionItem[],
  search: string,
): StockOverviewAttentionItem[] {
  const term = search.trim().toLowerCase();

  if (!term) {
    return items;
  }

  return items.filter((item) => item.name.toLowerCase().includes(term));
}

export function getStockQuantityClassName(currentStock: number, status: StockStatus): string {
  if (isNegativeStock(currentStock)) {
    return 'font-medium text-destructive';
  }

  if (status === 'out_of_stock') {
    return 'font-medium text-destructive';
  }

  if (status === 'low_stock') {
    return 'font-medium text-warning-foreground';
  }

  return 'tabular-nums';
}

export function getStockRowClassName(currentStock: number, status: StockStatus): string {
  if (isNegativeStock(currentStock) || status === 'out_of_stock') {
    return 'border-l-2 border-l-destructive/60 bg-destructive/5';
  }

  if (status === 'low_stock') {
    return 'border-l-2 border-l-warning/60 bg-warning/5';
  }

  return '';
}

export function isCriticalAttentionItem(item: StockOverviewAttentionItem): boolean {
  return item.isNegative || item.status === 'out_of_stock';
}

export function isLowStockAttentionItem(item: StockOverviewAttentionItem): boolean {
  return item.status === 'low_stock' && !isCriticalAttentionItem(item);
}

export function getCriticalAttentionItems(
  items: StockOverviewAttentionItem[],
): StockOverviewAttentionItem[] {
  return sortByStockSeverity(items.filter(isCriticalAttentionItem));
}

export function getLowStockAttentionItems(
  items: StockOverviewAttentionItem[],
): StockOverviewAttentionItem[] {
  return sortByStockSeverity(items.filter(isLowStockAttentionItem));
}
