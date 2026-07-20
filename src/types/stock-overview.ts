import type { StockStatus } from '@/lib/domain/stock-status';

export type StockOverviewSummary = {
  totalProducts: number;
  totalRawMaterials: number;
  lowStockItems: number;
  outOfStockItems: number;
};

export type StockOverviewProductItem = {
  id: string;
  name: string;
  code: string;
  currentStock: number;
  unit: string;
  status: StockStatus;
  href: string;
};

export type StockOverviewRawMaterialItem = {
  id: string;
  name: string;
  code: string;
  currentStock: number;
  unit: string;
  reorderLevel: number | null;
  status: StockStatus;
  href: string;
};

export type StockOverviewAttentionItem = {
  id: string;
  name: string;
  kind: 'product' | 'raw_material';
  currentStock: number;
  unit: string;
  status: StockStatus;
  isNegative: boolean;
  href: string;
  actionLabel: string;
};

export type StockOverviewData = {
  summary: StockOverviewSummary;
  products: StockOverviewProductItem[];
  rawMaterials: StockOverviewRawMaterialItem[];
  attentionItems: StockOverviewAttentionItem[];
};
