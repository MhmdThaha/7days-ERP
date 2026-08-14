import { describe, expect, it } from 'vitest';

import { buildDailySummaryAlerts } from '@/lib/domain/calculations/daily-operations';
import { DAILY_SUMMARY_DASHBOARD_LOW_STOCK_LIMIT } from '@/lib/domain/constants/daily-summary-dashboard';
import type {
  DailySummaryDashboardKpis,
  DailySummaryDashboardOperationalMetrics,
} from '@/types/daily-summary-dashboard';

const kpis: DailySummaryDashboardKpis = {
  netSales: 1000,
  netProfit: 100,
  grossProfit: 200,
  totalCogs: 800,
  expensesTotal: 50,
  wastageCost: 0,
  purchasesTotal: 0,
  productionUnits: 10,
};

const operationalMetrics: DailySummaryDashboardOperationalMetrics = {
  salesCount: 1,
  purchasesCount: 0,
  productionBatchCount: 1,
  expensesCount: 0,
  wastageCount: 0,
};

describe('buildDailySummaryAlerts stock alerts', () => {
  it('reports low-stock products from the queried product set', () => {
    const alerts = buildDailySummaryAlerts({
      kpis,
      operationalMetrics,
      products: [
        { id: 'p1', name: 'Bread', code: 'PRD-001', currentStock: 0, unit: 'pcs' },
        { id: 'p2', name: 'Cake', code: 'PRD-002', currentStock: -1, unit: 'pcs' },
      ],
      rawMaterials: [],
    });

    const lowStock = alerts.find((alert) => alert.type === 'low_stock');
    expect(lowStock?.description).toBe('2 products need restocking attention.');
  });

  it('reports negative-stock products by name', () => {
    const alerts = buildDailySummaryAlerts({
      kpis,
      operationalMetrics,
      products: [
        { id: 'p1', name: 'Bread', code: 'PRD-001', currentStock: 0, unit: 'pcs' },
        { id: 'p2', name: 'Croissant', code: 'PRD-002', currentStock: -2, unit: 'pcs' },
      ],
      rawMaterials: [],
    });

    const negative = alerts.find((alert) => alert.type === 'negative_stock');
    expect(negative?.description).toBe(
      'Croissant has negative stock. Review inventory immediately.',
    );
  });

  it('caps the low-stock product count at the dashboard alert limit', () => {
    const products = Array.from({ length: DAILY_SUMMARY_DASHBOARD_LOW_STOCK_LIMIT + 5 }, (_, index) => ({
      id: `p-${index}`,
      name: `Product ${index}`,
      code: `PRD-${index}`,
      currentStock: 0,
      unit: 'pcs',
    }));

    const alerts = buildDailySummaryAlerts({
      kpis,
      operationalMetrics,
      products,
      rawMaterials: [],
    });

    const lowStock = alerts.find((alert) => alert.type === 'low_stock');
    expect(lowStock?.description).toBe(
      `${DAILY_SUMMARY_DASHBOARD_LOW_STOCK_LIMIT} products need restocking attention.`,
    );
  });

  it('keeps raw-material low-stock rules based on reorderLevel', () => {
    const alerts = buildDailySummaryAlerts({
      kpis,
      operationalMetrics,
      products: [],
      rawMaterials: [
        {
          id: 'rm-1',
          name: 'Flour',
          code: 'RM-001',
          currentStock: 4,
          unit: 'kg',
          reorderLevel: 5,
        },
        {
          id: 'rm-2',
          name: 'Sugar',
          code: 'RM-002',
          currentStock: 1,
          unit: 'kg',
          reorderLevel: null,
        },
      ],
    });

    const lowStock = alerts.find((alert) => alert.type === 'low_stock');
    expect(lowStock?.description).toBe('1 raw material need restocking attention.');
  });
});
