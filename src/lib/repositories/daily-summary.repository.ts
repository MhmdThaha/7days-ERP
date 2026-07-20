import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';

import { DAILY_SUMMARY_COLLECTION } from '@/lib/domain/constants/daily-summary';
import { timestampToDate } from '@/lib/firebase/converters';
import { getOrgCollection } from '@/lib/repositories/base.repository';
import type { DailySummary, DailySummaryExpensesByCategory } from '@/types/daily-summary';

type DailySummaryDocument = {
  organizationId: string;
  summaryDate: string;
  isClosed: boolean;
  closedAt: Timestamp | null;
  closedBy: string | null;
  totalProductionUnits: number;
  totalProductionCost: number;
  totalSalesRevenue: number;
  totalSalesDiscount: number;
  totalNetSales: number;
  totalCogs: number;
  transactionCount: number;
  totalPurchases: number;
  totalExpenses: number;
  expensesByCategory: DailySummaryExpensesByCategory;
  totalWastageCost: number;
  wastageCount: number;
  grossProfit: number;
  netProfit: number;
  computedAt: Timestamp;
  version: number;
};

function toDailySummary(id: string, data: DailySummaryDocument): DailySummary {
  return {
    id,
    organizationId: data.organizationId,
    summaryDate: data.summaryDate,
    isClosed: data.isClosed,
    closedAt: timestampToDate(data.closedAt),
    closedBy: data.closedBy,
    totalProductionUnits: data.totalProductionUnits,
    totalProductionCost: data.totalProductionCost,
    totalSalesRevenue: data.totalSalesRevenue,
    totalSalesDiscount: data.totalSalesDiscount,
    totalNetSales: data.totalNetSales,
    totalCogs: data.totalCogs,
    transactionCount: data.transactionCount,
    totalPurchases: data.totalPurchases,
    totalExpenses: data.totalExpenses,
    expensesByCategory: data.expensesByCategory,
    totalWastageCost: data.totalWastageCost,
    wastageCount: data.wastageCount,
    grossProfit: data.grossProfit,
    netProfit: data.netProfit,
    computedAt: timestampToDate(data.computedAt) ?? new Date(),
    version: data.version,
  };
}

export const dailySummaryRepository = {
  async getByDate(orgId: string, date: string): Promise<DailySummary | null> {
    const doc = await getOrgCollection(orgId, DAILY_SUMMARY_COLLECTION).doc(date).get();

    if (!doc.exists) {
      return null;
    }

    return toDailySummary(doc.id, doc.data() as DailySummaryDocument);
  },

  async listByMonth(orgId: string, monthKey: string): Promise<DailySummary[]> {
    const snapshot = await getOrgCollection(orgId, DAILY_SUMMARY_COLLECTION)
      .where('summaryDate', '>=', `${monthKey}-01`)
      .where('summaryDate', '<=', `${monthKey}-31`)
      .get();

    return snapshot.docs
      .map((doc) => toDailySummary(doc.id, doc.data() as DailySummaryDocument))
      .sort((a, b) => a.summaryDate.localeCompare(b.summaryDate));
  },

  async upsert(
    orgId: string,
    summary: Omit<
      DailySummary,
      'id' | 'isClosed' | 'closedAt' | 'closedBy' | 'computedAt' | 'version'
    >,
  ): Promise<DailySummary> {
    const docRef = getOrgCollection(orgId, DAILY_SUMMARY_COLLECTION).doc(summary.summaryDate);
    const existing = await docRef.get();
    const existingData = existing.exists ? (existing.data() as DailySummaryDocument) : null;
    const now = Timestamp.now();
    const version = (existingData?.version ?? 0) + 1;

    const document: DailySummaryDocument = {
      organizationId: summary.organizationId,
      summaryDate: summary.summaryDate,
      isClosed: existingData?.isClosed ?? false,
      closedAt: existingData?.closedAt ?? null,
      closedBy: existingData?.closedBy ?? null,
      totalProductionUnits: summary.totalProductionUnits,
      totalProductionCost: summary.totalProductionCost,
      totalSalesRevenue: summary.totalSalesRevenue,
      totalSalesDiscount: summary.totalSalesDiscount,
      totalNetSales: summary.totalNetSales,
      totalCogs: summary.totalCogs,
      transactionCount: summary.transactionCount,
      totalPurchases: summary.totalPurchases,
      totalExpenses: summary.totalExpenses,
      expensesByCategory: summary.expensesByCategory,
      totalWastageCost: summary.totalWastageCost,
      wastageCount: summary.wastageCount,
      grossProfit: summary.grossProfit,
      netProfit: summary.netProfit,
      computedAt: now,
      version,
    };

    await docRef.set(document);

    return toDailySummary(summary.summaryDate, document);
  },
};
