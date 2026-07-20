import 'server-only';

import { STOCK_OVERVIEW_FETCH_PAGE_SIZE } from '@/lib/domain/constants/stock-overview';
import {
  getProductStockStatus,
  getRawMaterialStockStatus,
  isNegativeStock,
} from '@/lib/domain/stock-status';
import { productRepository } from '@/lib/repositories/product.repository';
import { rawMaterialRepository } from '@/lib/repositories/raw-material.repository';
import type {
  StockOverviewAttentionItem,
  StockOverviewData,
  StockOverviewProductItem,
  StockOverviewRawMaterialItem,
  StockOverviewSummary,
} from '@/types/stock-overview';

function buildSummary(
  products: StockOverviewProductItem[],
  rawMaterials: StockOverviewRawMaterialItem[],
): StockOverviewSummary {
  return {
    totalProducts: products.length,
    totalRawMaterials: rawMaterials.length,
    lowStockItems:
      products.filter((product) => product.status === 'low_stock').length +
      rawMaterials.filter((material) => material.status === 'low_stock').length,
    outOfStockItems:
      products.filter((product) => product.status === 'out_of_stock').length +
      rawMaterials.filter((material) => material.status === 'out_of_stock').length,
  };
}

function buildAttentionItems(
  products: StockOverviewProductItem[],
  rawMaterials: StockOverviewRawMaterialItem[],
): StockOverviewAttentionItem[] {
  const productAttention = products
    .filter((product) => product.status !== 'in_stock' || isNegativeStock(product.currentStock))
    .map((product) => ({
      id: product.id,
      name: product.name,
      kind: 'product' as const,
      currentStock: product.currentStock,
      unit: product.unit,
      status: product.status,
      isNegative: isNegativeStock(product.currentStock),
      href: product.href,
      actionLabel: 'Open Product',
    }));

  const rawMaterialAttention = rawMaterials
    .filter(
      (material) => material.status !== 'in_stock' || isNegativeStock(material.currentStock),
    )
    .map((material) => ({
      id: material.id,
      name: material.name,
      kind: 'raw_material' as const,
      currentStock: material.currentStock,
      unit: material.unit,
      status: material.status,
      isNegative: isNegativeStock(material.currentStock),
      href: material.href,
      actionLabel: 'Open Raw Material',
    }));

  return [...productAttention, ...rawMaterialAttention].sort((a, b) => {
    if (a.isNegative !== b.isNegative) {
      return a.isNegative ? -1 : 1;
    }

    if (a.status !== b.status) {
      if (a.status === 'out_of_stock') {
        return -1;
      }

      if (b.status === 'out_of_stock') {
        return 1;
      }
    }

    return a.name.localeCompare(b.name);
  });
}

export const stockOverviewRepository = {
  async getOverview(orgId: string): Promise<StockOverviewData> {
    const listParams = { page: 1, pageSize: STOCK_OVERVIEW_FETCH_PAGE_SIZE, status: 'active' as const };

    const [productsResult, rawMaterialsResult] = await Promise.all([
      productRepository.list(orgId, listParams),
      rawMaterialRepository.list(orgId, listParams),
    ]);

    const products: StockOverviewProductItem[] = productsResult.items
      .map((product) => ({
        id: product.id,
        name: product.name,
        code: product.code,
        currentStock: product.currentStock,
        unit: product.unit,
        status: getProductStockStatus(product.currentStock),
        href: `/products/${product.id}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const rawMaterials: StockOverviewRawMaterialItem[] = rawMaterialsResult.items
      .map((material) => ({
        id: material.id,
        name: material.name,
        code: material.code,
        currentStock: material.currentStock,
        unit: material.unit,
        reorderLevel: material.reorderLevel,
        status: getRawMaterialStockStatus(material.currentStock, material.reorderLevel),
        href: '/raw-materials',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      summary: buildSummary(products, rawMaterials),
      products,
      rawMaterials,
      attentionItems: buildAttentionItems(products, rawMaterials),
    };
  },
};
