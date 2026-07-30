import 'server-only';

import type { Query } from 'firebase-admin/firestore';

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

type ProductionDocument = {
  productionNumber: string;
  productionDate: string;
  status: 'draft' | 'completed';
  totalUnits: number;
  createdAt: FirebaseFirestore.Timestamp;
};

type SaleDocument = {
  saleNumber: string;
  saleDate: string;
  status: 'draft' | 'completed';
  subtotal: number;
  createdAt: FirebaseFirestore.Timestamp;
};

type ExpenseDocument = {
  expenseNumber: string;
  expenseDate: string;
  category: ExpenseCategory;
  amount: number;
  status: 'draft' | 'completed';
  createdAt: FirebaseFirestore.Timestamp;
};

type WastageDocument = {
  wastageNumber: string;
  wastageDate: string;
  reason: WastageReason;
  status: 'draft' | 'completed';
  totalUnits: number;
  createdAt: FirebaseFirestore.Timestamp;
};

type ReturnDocument = {
  returnNumber: string;
  returnDate: string;
  reason: ReturnReason;
  totalUnits: number;
  createdAt: FirebaseFirestore.Timestamp;
};

function activeOrgQuery(orgId: string, subcollection: string): Query {
  return getOrgCollection(orgId, subcollection).where('deletedAt', '==', null);
}

async function countQuery(query: Query): Promise<number> {
  const snapshot = await query.count().get();
  return snapshot.data().count;
}

async function countDraftDocuments(orgId: string, subcollection: string): Promise<number> {
  return countQuery(activeOrgQuery(orgId, subcollection).where('status', '==', 'draft'));
}

async function countActiveRecords(orgId: string, subcollection: string): Promise<number> {
  return countQuery(activeOrgQuery(orgId, subcollection).where('isActive', '==', true));
}

function buildSummaryFromTodayDocs(
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
    if (sale.saleDate === today && sale.status === 'completed') {
      todaySalesTotal += sale.subtotal;
    }
  }

  for (const entry of production) {
    if (entry.productionDate === today && entry.status === 'completed') {
      todayProductionUnits += entry.totalUnits;
    }
  }

  for (const expense of expenses) {
    if (expense.expenseDate === today && expense.status === 'completed') {
      todayExpensesTotal += expense.amount;
    }
  }

  for (const entry of wastage) {
    if (entry.wastageDate === today && entry.status === 'completed') {
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
    const recentLimit = DASHBOARD_RECENT_ACTIVITY_LIMIT;

    const [
      todaySalesSnapshot,
      todayProductionSnapshot,
      todayExpensesSnapshot,
      todayWastageSnapshot,
      totalProducts,
      totalRawMaterials,
      draftPurchases,
      draftProduction,
      draftSales,
      draftExpenses,
      lowStockSnapshot,
      recentProductionSnapshot,
      recentSalesSnapshot,
      recentWastageSnapshot,
      recentReturnsSnapshot,
      recentExpensesSnapshot,
    ] = await Promise.all([
      activeOrgQuery(orgId, 'sales')
        .where('saleDate', '==', today)
        .where('status', '==', 'completed')
        .get(),
      activeOrgQuery(orgId, 'production')
        .where('productionDate', '==', today)
        .where('status', '==', 'completed')
        .get(),
      activeOrgQuery(orgId, 'expenses')
        .where('expenseDate', '==', today)
        .where('status', '==', 'completed')
        .get(),
      activeOrgQuery(orgId, 'wastage')
        .where('wastageDate', '==', today)
        .where('status', '==', 'completed')
        .get(),
      countActiveRecords(orgId, 'products'),
      countActiveRecords(orgId, 'rawMaterials'),
      countDraftDocuments(orgId, 'purchases'),
      countDraftDocuments(orgId, 'production'),
      countDraftDocuments(orgId, 'sales'),
      countDraftDocuments(orgId, 'expenses'),
      activeOrgQuery(orgId, 'products')
        .where('isActive', '==', true)
        .where('currentStock', '<=', PRODUCT_LOW_STOCK_THRESHOLD)
        .orderBy('currentStock')
        .limit(DASHBOARD_LOW_STOCK_LIMIT)
        .get(),
      activeOrgQuery(orgId, 'production')
        .orderBy('createdAt', 'desc')
        .limit(recentLimit)
        .get(),
      activeOrgQuery(orgId, 'sales').orderBy('createdAt', 'desc').limit(recentLimit).get(),
      activeOrgQuery(orgId, 'wastage').orderBy('createdAt', 'desc').limit(recentLimit).get(),
      activeOrgQuery(orgId, 'returns').orderBy('createdAt', 'desc').limit(recentLimit).get(),
      activeOrgQuery(orgId, 'expenses').orderBy('createdAt', 'desc').limit(recentLimit).get(),
    ]);

    const todaySales = todaySalesSnapshot.docs.map((doc) => doc.data() as SaleDocument);
    const todayProduction = todayProductionSnapshot.docs.map((doc) => doc.data() as ProductionDocument);
    const todayExpenses = todayExpensesSnapshot.docs.map((doc) => doc.data() as ExpenseDocument);
    const todayWastage = todayWastageSnapshot.docs.map((doc) => doc.data() as WastageDocument);

    const quickCounts: DashboardQuickCounts = {
      totalProducts,
      totalRawMaterials,
      draftPurchases,
      draftProduction,
      draftSales,
      draftExpenses,
    };

    const lowStockProducts: DashboardLowStockProduct[] = lowStockSnapshot.docs
      .map((doc) => {
        const data = doc.data() as ProductDocument;
        return {
          id: doc.id,
          code: data.code,
          name: data.name,
          currentStock: data.currentStock,
          unit: data.unit,
        };
      })
      .sort((a, b) => a.currentStock - b.currentStock || a.name.localeCompare(b.name));

    const production = recentProductionSnapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as ProductionDocument,
    }));
    const sales = recentSalesSnapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as SaleDocument,
    }));
    const wastage = recentWastageSnapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as WastageDocument,
    }));
    const returns = recentReturnsSnapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as ReturnDocument,
    }));
    const expenses = recentExpensesSnapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as ExpenseDocument,
    }));

    return {
      summary: buildSummaryFromTodayDocs(today, todaySales, todayProduction, todayExpenses, todayWastage),
      quickCounts,
      lowStockProducts,
      recentActivity: buildRecentActivity(production, sales, wastage, returns, expenses),
    };
  },
};
