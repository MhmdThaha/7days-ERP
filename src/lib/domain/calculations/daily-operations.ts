import {
  DAILY_SUMMARY_DASHBOARD_LOW_STOCK_LIMIT,
  DAILY_SUMMARY_HIGH_WASTAGE_SALES_RATIO,
} from '@/lib/domain/constants/daily-summary-dashboard';
import {
  isOutOfStock,
  isProductLowStock,
  isRawMaterialLowStock,
} from '@/lib/domain/stock-status';
import type {
  DailySummaryDashboardAlert,
  DailySummaryDashboardKpis,
  DailySummaryDashboardOperationalMetrics,
  DailySummaryDashboardQuickSummaryItem,
} from '@/types/daily-summary-dashboard';

type StockItem = {
  id: string;
  name: string;
  code: string;
  currentStock: number;
  unit: string;
  reorderLevel?: number | null;
};

export function buildDailySummaryAlerts(input: {
  kpis: DailySummaryDashboardKpis;
  operationalMetrics: DailySummaryDashboardOperationalMetrics;
  products: StockItem[];
  rawMaterials: StockItem[];
}): DailySummaryDashboardAlert[] {
  const alerts: DailySummaryDashboardAlert[] = [];
  const { kpis, operationalMetrics, products, rawMaterials } = input;

  const lowStockProducts = products.filter(
    (product) => isProductLowStock(product.currentStock),
  );
  const lowStockRawMaterials = rawMaterials.filter((material) =>
    isRawMaterialLowStock(material.currentStock, material.reorderLevel ?? null),
  );
  const negativeStockItems = [...products, ...rawMaterials].filter(
    (item) => item.currentStock < 0,
  );

  if (lowStockProducts.length > 0 || lowStockRawMaterials.length > 0) {
    const productCount = Math.min(lowStockProducts.length, DAILY_SUMMARY_DASHBOARD_LOW_STOCK_LIMIT);
    const materialCount = Math.min(
      lowStockRawMaterials.length,
      DAILY_SUMMARY_DASHBOARD_LOW_STOCK_LIMIT,
    );
    const parts: string[] = [];

    if (productCount > 0) {
      parts.push(`${productCount} product${productCount === 1 ? '' : 's'}`);
    }

    if (materialCount > 0) {
      parts.push(`${materialCount} raw material${materialCount === 1 ? '' : 's'}`);
    }

    alerts.push({
      id: 'low-stock',
      type: 'low_stock',
      severity: 'warning',
      title: 'Low stock items',
      description: `${parts.join(' and ')} need restocking attention.`,
    });
  }

  if (negativeStockItems.length > 0) {
    const names = negativeStockItems
      .slice(0, 3)
      .map((item) => item.name)
      .join(', ');

    alerts.push({
      id: 'negative-stock',
      type: 'negative_stock',
      severity: 'critical',
      title: 'Negative stock detected',
      description:
        negativeStockItems.length === 1
          ? `${names} has negative stock. Review inventory immediately.`
          : `${negativeStockItems.length} items have negative stock, including ${names}.`,
    });
  }

  const isHighWastage =
    kpis.wastageCost > 0 &&
    (kpis.netSales <= 0 ||
      kpis.wastageCost / kpis.netSales >= DAILY_SUMMARY_HIGH_WASTAGE_SALES_RATIO);

  if (isHighWastage) {
    alerts.push({
      id: 'high-wastage',
      type: 'high_wastage',
      severity: 'warning',
      title: 'High wastage today',
      description:
        kpis.netSales > 0
          ? 'Wastage cost is unusually high relative to today’s sales.'
          : 'Wastage was recorded today without corresponding sales.',
    });
  }

  if (operationalMetrics.productionBatchCount === 0) {
    alerts.push({
      id: 'no-production',
      type: 'no_production',
      severity: 'info',
      title: 'No production today',
      description: 'No production batches have been completed today.',
    });
  }

  if (operationalMetrics.salesCount === 0) {
    alerts.push({
      id: 'no-sales',
      type: 'no_sales',
      severity: 'info',
      title: 'No sales today',
      description: 'No completed sales have been recorded today.',
    });
  }

  return alerts;
}

export function buildDailySummaryQuickSummary(input: {
  kpis: DailySummaryDashboardKpis;
  operationalMetrics: DailySummaryDashboardOperationalMetrics;
  alerts: DailySummaryDashboardAlert[];
}): DailySummaryDashboardQuickSummaryItem[] {
  const { kpis, operationalMetrics, alerts } = input;
  const items: DailySummaryDashboardQuickSummaryItem[] = [];
  const hasHighWastageAlert = alerts.some((alert) => alert.type === 'high_wastage');

  if (operationalMetrics.salesCount > 0 && kpis.netSales > 0) {
    items.push({
      id: 'sales-healthy',
      tone: 'positive',
      message: 'Sales today are healthy.',
    });
  } else {
    items.push({
      id: 'no-sales-summary',
      tone: 'neutral',
      message: 'No sales recorded today yet.',
    });
  }

  if (operationalMetrics.purchasesCount === 0) {
    items.push({
      id: 'no-purchases',
      tone: 'neutral',
      message: 'No purchases recorded today.',
    });
  } else {
    items.push({
      id: 'purchases-recorded',
      tone: 'positive',
      message: `${operationalMetrics.purchasesCount} purchase${operationalMetrics.purchasesCount === 1 ? '' : 's'} received today.`,
    });
  }

  if (hasHighWastageAlert) {
    items.push({
      id: 'high-wastage-summary',
      tone: 'warning',
      message: 'High wastage today — review production and storage.',
    });
  }

  if (kpis.netProfit > 0) {
    items.push({
      id: 'profit-positive',
      tone: 'positive',
      message: 'Profit is positive today.',
    });
  } else if (kpis.netProfit < 0) {
    items.push({
      id: 'profit-negative',
      tone: 'negative',
      message: 'Profit is negative today.',
    });
  } else {
    items.push({
      id: 'profit-neutral',
      tone: 'neutral',
      message: 'No net profit recorded today yet.',
    });
  }

  if (operationalMetrics.productionBatchCount > 0) {
    items.push({
      id: 'production-success',
      tone: 'positive',
      message: 'Production completed successfully today.',
    });
  } else {
    items.push({
      id: 'no-production-summary',
      tone: 'neutral',
      message: 'No production recorded today.',
    });
  }

  return items;
}
