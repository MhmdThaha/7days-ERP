import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';

import { DAILY_SUMMARY_COLLECTION } from '@/lib/domain/constants/daily-summary';
import { timestampToDate } from '@/lib/firebase/converters';
import { getFirestore, getOrgCollection } from '@/lib/repositories/base.repository';
import type { DailySummary, DailySummaryExpensesByCategory } from '@/types/daily-summary';

export class DailySummaryVersionConflictError extends Error {
  readonly code = 'DAILY_SUMMARY_VERSION_CONFLICT';

  constructor() {
    super('Daily summary was updated by a concurrent recalculation');
    this.name = 'DailySummaryVersionConflictError';
  }
}

export function isDailySummaryVersionConflictError(
  error: unknown,
): error is DailySummaryVersionConflictError {
  return error instanceof DailySummaryVersionConflictError;
}

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
  /** Absent on documents written before this field existed. */
  needsRecalculation?: boolean;
};

type DailySummaryWriteInput = Omit<
  DailySummary,
  'id' | 'isClosed' | 'closedAt' | 'closedBy' | 'computedAt' | 'version' | 'needsRecalculation'
>;

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
    needsRecalculation: data.needsRecalculation === true,
  };
}

function buildDocument(
  summary: DailySummaryWriteInput,
  existingData: DailySummaryDocument | null,
  nextVersion: number,
): DailySummaryDocument {
  return {
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
    computedAt: Timestamp.now(),
    version: nextVersion,
    needsRecalculation: false,
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

  /**
   * Marks an existing day summary as stale after a failed post-mutation recalculate.
   * No-op when the document is missing — getOrRecalculate already recalculates missing days.
   */
  async markNeedsRecalculation(orgId: string, date: string): Promise<void> {
    const docRef = getOrgCollection(orgId, DAILY_SUMMARY_COLLECTION).doc(date);
    const existing = await docRef.get();

    if (!existing.exists) {
      return;
    }

    await docRef.update({
      needsRecalculation: true,
    });
  },

  /**
   * Writes a full recomputed summary only when the document version still matches
   * `expectedVersion` (0 when the document does not exist yet).
   */
  async upsertIfVersionMatches(
    orgId: string,
    summary: DailySummaryWriteInput,
    expectedVersion: number,
  ): Promise<DailySummary> {
    const firestore = getFirestore();
    const docRef = getOrgCollection(orgId, DAILY_SUMMARY_COLLECTION).doc(summary.summaryDate);

    return firestore.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);
      const existingData = snap.exists ? (snap.data() as DailySummaryDocument) : null;
      const currentVersion = existingData?.version ?? 0;

      if (currentVersion !== expectedVersion) {
        throw new DailySummaryVersionConflictError();
      }

      const document = buildDocument(summary, existingData, expectedVersion + 1);
      transaction.set(docRef, document);
      return toDailySummary(summary.summaryDate, document);
    });
  },
};
