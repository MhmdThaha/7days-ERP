import { describe, expect, it } from 'vitest';

import { buildDailyBusinessStatement } from '@/lib/domain/mappers/daily-business-statement';
import type { DailySummary } from '@/types/daily-summary';
import type { Expense } from '@/types/expense';
import type { Production } from '@/types/production';
import type { ReturnEntry } from '@/types/return';
import type { Sale } from '@/types/sale';
import type { Wastage } from '@/types/wastage';

function makeSummary(overrides: Partial<DailySummary> = {}): DailySummary {
  return {
    id: '2026-08-10',
    organizationId: 'org-1',
    summaryDate: '2026-08-10',
    isClosed: false,
    closedAt: null,
    closedBy: null,
    totalProductionUnits: 99,
    totalProductionCost: 2_000,
    totalSalesRevenue: 10_000,
    totalSalesDiscount: 0,
    totalNetSales: 10_000,
    totalCogs: 4_000,
    transactionCount: 3,
    totalPurchases: 1_500,
    totalExpenses: 1_000,
    expensesByCategory: { rent: 700, electricity: 300 },
    totalWastageCost: 500,
    wastageCount: 1,
    grossProfit: 999,
    netProfit: 7,
    computedAt: new Date('2026-08-10T18:00:00.000Z'),
    version: 1,
    needsRecalculation: false,
    ...overrides,
  };
}

describe('buildDailyBusinessStatement', () => {
  it('copies DailySummary financials without recalculating profit', () => {
    const statement = buildDailyBusinessStatement({
      reportDate: '2026-08-10',
      summary: makeSummary(),
      sales: [],
      expenses: [],
      production: [],
      wastage: [],
      returns: [],
    });

    expect(statement.reportDate).toBe('2026-08-10');
    expect(statement.summary.netSales).toBe(10_000);
    expect(statement.summary.totalCogs).toBe(4_000);
    expect(statement.summary.grossProfit).toBe(999);
    expect(statement.summary.netProfit).toBe(7);
    expect(statement.summary.expensesTotal).toBe(1_000);
    expect(statement.summary.wastageCost).toBe(500);
    expect(statement.summary.totalPurchases).toBe(1_500);
    expect(statement.summary.totalProductionCost).toBe(2_000);
    expect(statement.summary.expensesByCategory).toEqual([
      { category: 'rent', label: 'Rent', amount: 700 },
      { category: 'electricity', label: 'Electricity', amount: 300 },
    ]);
  });

  it('builds an empty day with zero counts and header-ready empty arrays', () => {
    const statement = buildDailyBusinessStatement({
      reportDate: '2026-08-10',
      summary: makeSummary({
        totalNetSales: 0,
        totalCogs: 0,
        grossProfit: 0,
        totalExpenses: 0,
        expensesByCategory: {},
        totalWastageCost: 0,
        netProfit: 0,
        totalPurchases: 0,
        totalProductionCost: 0,
      }),
      sales: [],
      expenses: [],
      production: [],
      wastage: [],
      returns: [],
    });

    expect(statement.sales).toEqual([]);
    expect(statement.expenses).toEqual([]);
    expect(statement.production).toEqual([]);
    expect(statement.wastage).toEqual([]);
    expect(statement.returns).toEqual([]);
    expect(statement.summary.salesCount).toBe(0);
    expect(statement.summary.activityCount).toBe(0);
    expect(statement.summary.netSales).toBe(0);
  });

  it('preserves stored sale lines and snapshot line profit only', () => {
    const sale: Sale = {
      id: 'sale-1',
      organizationId: 'org-1',
      saleNumber: 'SAL-001',
      saleDate: '2026-08-10',
      customerId: null,
      customerNameSnapshot: 'Corner Shop',
      status: 'completed',
      lines: [
        {
          id: 'line-1',
          productId: 'p-1',
          productNameSnapshot: 'Bread',
          productCodeSnapshot: 'BRD',
          sellingPriceSnapshot: 5000,
          quantity: 2,
          unit: 'pcs',
          lineTotal: 10_000,
          unitCost: 2000,
          cogs: 4000,
        },
      ],
      subtotal: 10_000,
      totalCogs: 4000,
      lineCount: 1,
      notes: null,
      createdAt: new Date('2026-08-10T08:00:00.000Z'),
      createdBy: 'u1',
      updatedAt: new Date('2026-08-10T08:00:00.000Z'),
      updatedBy: 'u1',
      completedAt: new Date('2026-08-10T08:05:00.000Z'),
      completedBy: 'u1',
      deletedAt: null,
      deletedBy: null,
    };

    const statement = buildDailyBusinessStatement({
      reportDate: '2026-08-10',
      summary: makeSummary(),
      sales: [sale],
      expenses: [],
      production: [],
      wastage: [],
      returns: [],
    });

    expect(statement.sales).toEqual([
      {
        saleNumber: 'SAL-001',
        saleDate: '2026-08-10',
        completedAt: '2026-08-10T08:05:00.000Z',
        customerNameSnapshot: 'Corner Shop',
        productCodeSnapshot: 'BRD',
        productNameSnapshot: 'Bread',
        quantity: 2,
        unit: 'pcs',
        sellingPriceSnapshot: 5000,
        lineTotal: 10_000,
        storedCogs: 4000,
        storedLineProfit: 6000,
      },
    ]);
    expect(statement.summary.salesCount).toBe(1);
  });

  it('preserves expense notes and amounts', () => {
    const expense: Expense = {
      id: 'exp-1',
      organizationId: 'org-1',
      expenseNumber: 'EXP-001',
      expenseDate: '2026-08-10',
      category: 'rent',
      amount: 700,
      status: 'completed',
      notes: 'Shop rent',
      createdAt: new Date(),
      createdBy: 'u1',
      updatedAt: new Date(),
      updatedBy: 'u1',
      completedAt: new Date(),
      completedBy: 'u1',
      deletedAt: null,
      deletedBy: null,
    };

    const statement = buildDailyBusinessStatement({
      reportDate: '2026-08-10',
      summary: makeSummary(),
      sales: [],
      expenses: [expense],
      production: [],
      wastage: [],
      returns: [],
    });

    expect(statement.expenses).toEqual([
      {
        expenseNumber: 'EXP-001',
        expenseDate: '2026-08-10',
        category: 'rent',
        categoryLabel: 'Rent',
        notes: 'Shop rent',
        amount: 700,
      },
    ]);
  });

  it('preserves production lines without inventing cost', () => {
    const production: Production = {
      id: 'prd-1',
      organizationId: 'org-1',
      productionNumber: 'PRD-001',
      productionDate: '2026-08-10',
      status: 'completed',
      lines: [
        {
          id: 'pl-1',
          productId: 'p-1',
          productCode: 'BRD',
          productName: 'Bread',
          quantity: 40,
          unit: 'pcs',
          recipeId: 'r-1',
          recipeCode: 'R-BRD',
          recipeName: 'White bread',
          recipeVersion: 2,
        },
      ],
      totalUnits: 40,
      lineCount: 1,
      notes: null,
      createdAt: new Date(),
      createdBy: 'u1',
      updatedAt: new Date(),
      updatedBy: 'u1',
      completedAt: new Date(),
      completedBy: 'u1',
      deletedAt: null,
      deletedBy: null,
    };

    const statement = buildDailyBusinessStatement({
      reportDate: '2026-08-10',
      summary: makeSummary(),
      sales: [],
      expenses: [],
      production: [production],
      wastage: [],
      returns: [],
    });

    expect(statement.production).toEqual([
      {
        productionNumber: 'PRD-001',
        productionDate: '2026-08-10',
        productCode: 'BRD',
        productName: 'Bread',
        quantity: 40,
        unit: 'pcs',
        recipeName: 'White bread',
      },
    ]);
    expect(statement.production[0]).not.toHaveProperty('cost');
    expect(statement.summary.productionUnits).toBe(40);
    expect(statement.summary.productionBatchCount).toBe(1);
  });

  it('copies stored wastage line costs', () => {
    const wastage: Wastage = {
      id: 'wst-1',
      organizationId: 'org-1',
      wastageNumber: 'WST-001',
      wastageDate: '2026-08-10',
      reason: 'burnt',
      status: 'completed',
      lines: [
        {
          id: 'wl-1',
          productId: 'p-1',
          productNameSnapshot: 'Bread',
          productCodeSnapshot: 'BRD',
          quantity: 3,
          unit: 'pcs',
          unitCost: 200,
          estimatedCost: 600,
        },
      ],
      lineCount: 1,
      totalUnits: 3,
      totalWastageCost: 600,
      notes: null,
      createdAt: new Date(),
      createdBy: 'u1',
      updatedAt: new Date(),
      updatedBy: 'u1',
      completedAt: new Date(),
      completedBy: 'u1',
      deletedAt: null,
      deletedBy: null,
    };

    const statement = buildDailyBusinessStatement({
      reportDate: '2026-08-10',
      summary: makeSummary(),
      sales: [],
      expenses: [],
      production: [],
      wastage: [wastage],
      returns: [],
    });

    expect(statement.wastage[0]).toMatchObject({
      wastageNumber: 'WST-001',
      estimatedCost: 600,
      unitCost: 200,
      reasonLabel: 'Burnt',
    });
  });

  it('maps return lines with quantities and no refund amount', () => {
    const returnEntry: ReturnEntry = {
      id: 'ret-1',
      organizationId: 'org-1',
      returnNumber: 'RET-001',
      returnDate: '2026-08-10',
      reason: 'unsold',
      status: 'completed',
      lines: [
        {
          id: 'rl-1',
          productId: 'p-1',
          productNameSnapshot: 'Bread',
          productCodeSnapshot: 'BRD',
          quantity: 2,
          unit: 'pcs',
        },
      ],
      lineCount: 1,
      totalUnits: 2,
      notes: null,
      createdAt: new Date(),
      createdBy: 'u1',
      updatedAt: new Date(),
      updatedBy: 'u1',
      completedAt: new Date(),
      completedBy: 'u1',
      deletedAt: null,
      deletedBy: null,
    };

    const statement = buildDailyBusinessStatement({
      reportDate: '2026-08-10',
      summary: makeSummary(),
      sales: [],
      expenses: [],
      production: [],
      wastage: [],
      returns: [returnEntry],
    });

    expect(statement.returns).toEqual([
      {
        returnNumber: 'RET-001',
        returnDate: '2026-08-10',
        productCodeSnapshot: 'BRD',
        productNameSnapshot: 'Bread',
        quantity: 2,
        unit: 'pcs',
        reason: 'unsold',
        reasonLabel: 'Unsold',
        status: 'completed',
      },
    ]);
    expect(JSON.stringify(statement.returns)).not.toMatch(/refund|amount/i);
    expect(statement.returns[0]).not.toHaveProperty('refundAmount');
  });
});
