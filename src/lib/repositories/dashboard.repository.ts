import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';

import {
  DASHBOARD_LOW_STOCK_LIMIT,
  DASHBOARD_RECENT_ACTIVITY_LIMIT,
  PRODUCT_LOW_STOCK_THRESHOLD,
} from '@/lib/domain/constants/dashboard';
import { EXPENSE_CATEGORY_LABELS } from '@/lib/domain/constants/expense';
import { RETURN_REASON_LABELS } from '@/lib/domain/constants/return';
import { WASTAGE_REASON_LABELS } from '@/lib/domain/constants/wastage';
import { timestampToDate } from '@/lib/firebase/converters';
import { getOrgCollection } from '@/lib/repositories/base.repository';
import type {
  DashboardData,
  DashboardLowStockProduct,
  DashboardQuickCounts,
  DashboardRecentActivity,
  DashboardRecentActivityItem,
  DashboardSummary,
} from '@/types/dashboard';
import type { ExpenseCategory } from '@/types/expense';
import type { ReturnReason } from '@/types/return';
import type { WastageReason } from '@/types/wastage';

type ProductDocument = {
  code: string;
  name: string;
  unit: string;
  isActive: boolean;
  currentStock: number;
};

type RawMaterialDocument = {
  isActive: boolean;
};

type PurchaseDocument = {
  status: 'draft' | 'received';
};

type ProductionDocument = {
  productionNumber: string;
  productionDate: string;
  status: 'draft' | 'completed';
  totalUnits: number;
  createdAt: Timestamp;
};

type SaleDocument = {
  saleNumber: string;
  saleDate: string;
  status: 'draft' | 'completed';
  subtotal: number;
  createdAt: Timestamp;
};

type ExpenseDocument = {
  expenseNumber: string;
  expenseDate: string;
  category: ExpenseCategory;
  amount: number;
  status: 'draft' | 'completed';
  createdAt: Timestamp;
};

type WastageDocument = {
  wastageNumber: string;
  wastageDate: string;
  reason: WastageReason;
  status: 'draft' | 'completed';
  totalUnits: number;
  createdAt: Timestamp;
};

type ReturnDocument = {
  returnNumber: string;
  returnDate: string;
  reason: ReturnReason;
  totalUnits: number;
  createdAt: Timestamp;
};

function isCompletedToday(
  date: string,
  status: 'draft' | 'completed' | 'received',
  today: string,
): boolean {
  return date === today && status === 'completed';
}

function buildSummary(
  today: string,
  sales: SaleDocument[],
  production: ProductionDocument[],
  expenses: ExpenseDocument[],
  wastage: WastageDocument[],
): DashboardSummary {
  let todaySalesTotal = 0;
  let todayProductionUnits = 0;
  let todayExpensesTotal = 0;
  let todayWastageUnits = 0;

  for (const sale of sales) {
    if (isCompletedToday(sale.saleDate, sale.status, today)) {
      todaySalesTotal += sale.subtotal;
    }
  }

  for (const entry of production) {
    if (isCompletedToday(entry.productionDate, entry.status, today)) {
      todayProductionUnits += entry.totalUnits;
    }
  }

  for (const expense of expenses) {
    if (isCompletedToday(expense.expenseDate, expense.status, today)) {
      todayExpensesTotal += expense.amount;
    }
  }

  for (const entry of wastage) {
    if (isCompletedToday(entry.wastageDate, entry.status, today)) {
      todayWastageUnits += entry.totalUnits;
    }
  }

  return {
    todayDate: today,
    todaySalesTotal,
    todayProductionUnits,
    todayExpensesTotal,
    todayWastageUnits,
  };
}

function buildQuickCounts(
  products: Array<{ data: ProductDocument }>,
  rawMaterials: Array<{ data: RawMaterialDocument }>,
  purchases: PurchaseDocument[],
  production: ProductionDocument[],
  sales: SaleDocument[],
  expenses: ExpenseDocument[],
): DashboardQuickCounts {
  return {
    totalProducts: products.filter(({ data }) => data.isActive).length,
    totalRawMaterials: rawMaterials.filter(({ data }) => data.isActive).length,
    draftPurchases: purchases.filter((purchase) => purchase.status === 'draft').length,
    draftProduction: production.filter((entry) => entry.status === 'draft').length,
    draftSales: sales.filter((sale) => sale.status === 'draft').length,
    draftExpenses: expenses.filter((expense) => expense.status === 'draft').length,
  };
}

function buildLowStockProducts(products: Array<{ id: string; data: ProductDocument }>): DashboardLowStockProduct[] {
  return products
    .filter(
      ({ data }) =>
        data.isActive && data.currentStock <= PRODUCT_LOW_STOCK_THRESHOLD,
    )
    .map(({ id, data }) => ({
      id,
      code: data.code,
      name: data.name,
      currentStock: data.currentStock,
      unit: data.unit,
    }))
    .sort((a, b) => a.currentStock - b.currentStock || a.name.localeCompare(b.name))
    .slice(0, DASHBOARD_LOW_STOCK_LIMIT);
}

function sortRecentItems(items: DashboardRecentActivityItem[]): DashboardRecentActivityItem[] {
  return items
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, DASHBOARD_RECENT_ACTIVITY_LIMIT);
}

function buildRecentActivity(
  production: Array<{ id: string; data: ProductionDocument }>,
  sales: Array<{ id: string; data: SaleDocument }>,
  wastage: Array<{ id: string; data: WastageDocument }>,
  returns: Array<{ id: string; data: ReturnDocument }>,
  expenses: Array<{ id: string; data: ExpenseDocument }>,
): DashboardRecentActivity {
  return {
    production: sortRecentItems(
      production.map(({ id, data }) => ({
        id,
        number: data.productionNumber,
        date: data.productionDate,
        detail: `${data.totalUnits.toLocaleString('en-IN')} units`,
        href: `/production/${id}`,
        createdAt: timestampToDate(data.createdAt) ?? new Date(),
      })),
    ),
    sales: sortRecentItems(
      sales.map(({ id, data }) => ({
        id,
        number: data.saleNumber,
        date: data.saleDate,
        detail: data.status === 'completed' ? 'Completed' : 'Draft',
        href: `/sales/${id}`,
        createdAt: timestampToDate(data.createdAt) ?? new Date(),
      })),
    ),
    wastage: sortRecentItems(
      wastage.map(({ id, data }) => ({
        id,
        number: data.wastageNumber,
        date: data.wastageDate,
        detail: WASTAGE_REASON_LABELS[data.reason],
        href: `/wastage/${id}`,
        createdAt: timestampToDate(data.createdAt) ?? new Date(),
      })),
    ),
    returns: sortRecentItems(
      returns.map(({ id, data }) => ({
        id,
        number: data.returnNumber,
        date: data.returnDate,
        detail: RETURN_REASON_LABELS[data.reason],
        href: `/returns/${id}`,
        createdAt: timestampToDate(data.createdAt) ?? new Date(),
      })),
    ),
    expenses: sortRecentItems(
      expenses.map(({ id, data }) => ({
        id,
        number: data.expenseNumber,
        date: data.expenseDate,
        detail: EXPENSE_CATEGORY_LABELS[data.category],
        href: `/expenses/${id}`,
        createdAt: timestampToDate(data.createdAt) ?? new Date(),
      })),
    ),
  };
}

export const dashboardRepository = {
  async getData(orgId: string, today: string): Promise<DashboardData> {
    const [
      productsSnapshot,
      rawMaterialsSnapshot,
      purchasesSnapshot,
      productionSnapshot,
      salesSnapshot,
      expensesSnapshot,
      wastageSnapshot,
      returnsSnapshot,
    ] = await Promise.all([
      getOrgCollection(orgId, 'products').where('deletedAt', '==', null).get(),
      getOrgCollection(orgId, 'rawMaterials').where('deletedAt', '==', null).get(),
      getOrgCollection(orgId, 'purchases').where('deletedAt', '==', null).get(),
      getOrgCollection(orgId, 'production').where('deletedAt', '==', null).get(),
      getOrgCollection(orgId, 'sales').where('deletedAt', '==', null).get(),
      getOrgCollection(orgId, 'expenses').where('deletedAt', '==', null).get(),
      getOrgCollection(orgId, 'wastage').where('deletedAt', '==', null).get(),
      getOrgCollection(orgId, 'returns').where('deletedAt', '==', null).get(),
    ]);

    const products = productsSnapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as ProductDocument,
    }));

    const rawMaterials = rawMaterialsSnapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as RawMaterialDocument,
    }));

    const purchases = purchasesSnapshot.docs.map((doc) => doc.data() as PurchaseDocument);
    const production = productionSnapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as ProductionDocument,
    }));
    const sales = salesSnapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as SaleDocument,
    }));
    const expenses = expensesSnapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as ExpenseDocument,
    }));
    const wastage = wastageSnapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as WastageDocument,
    }));
    const returns = returnsSnapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as ReturnDocument,
    }));

    const productionData = production.map((entry) => entry.data);
    const salesData = sales.map((entry) => entry.data);
    const expensesData = expenses.map((entry) => entry.data);
    const wastageData = wastage.map((entry) => entry.data);

    return {
      summary: buildSummary(today, salesData, productionData, expensesData, wastageData),
      quickCounts: buildQuickCounts(
        products,
        rawMaterials,
        purchases,
        productionData,
        salesData,
        expensesData,
      ),
      lowStockProducts: buildLowStockProducts(products),
      recentActivity: buildRecentActivity(production, sales, wastage, returns, expenses),
    };
  },
};
