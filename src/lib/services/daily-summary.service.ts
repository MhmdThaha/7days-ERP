import 'server-only';

import {
  buildDailySummaryMetrics,
  resolveCostTotal,
} from '@/lib/domain/calculations/summary-aggregation';
import {
  dailySummaryRepository,
  isDailySummaryVersionConflictError,
} from '@/lib/repositories/daily-summary.repository';
import { expenseRepository } from '@/lib/repositories/expense.repository';
import { inventoryMovementRepository } from '@/lib/repositories/inventory-movement.repository';
import { productionRepository } from '@/lib/repositories/production.repository';
import { purchaseRepository } from '@/lib/repositories/purchase.repository';
import { saleRepository } from '@/lib/repositories/sale.repository';
import { wastageRepository } from '@/lib/repositories/wastage.repository';
import { scheduleAfterResponse } from '@/lib/server/schedule-after-response';
import { getDaysInMonth } from '@/lib/utils/month';
import type { DailySummary, DailySummaryExpensesByCategory } from '@/types/daily-summary';
import type { ExpenseCategory } from '@/types/expense';

/** Initial attempt + retries after concurrent version conflicts. */
const MAX_RECALCULATION_ATTEMPTS = 3;

export const dailySummaryService = {
  async getOrRecalculate(orgId: string, date: string): Promise<DailySummary> {
    const existing = await dailySummaryRepository.getByDate(orgId, date);

    if (existing && !existing.needsRecalculation) {
      return existing;
    }

    return this.recalculate(orgId, date);
  },

  async getSummariesForMonth(orgId: string, monthKey: string): Promise<DailySummary[]> {
    const dates = getDaysInMonth(monthKey);
    const existingSummaries = await dailySummaryRepository.listByMonth(orgId, monthKey);
    const summariesByDate = new Map(
      existingSummaries.map((summary) => [summary.summaryDate, summary]),
    );

    const datesNeedingRecalculation = dates.filter((date) => {
      const summary = summariesByDate.get(date);
      return !summary || summary.needsRecalculation;
    });

    if (datesNeedingRecalculation.length > 0) {
      const recalculated = await Promise.all(
        datesNeedingRecalculation.map((date) => this.recalculate(orgId, date)),
      );

      for (const summary of recalculated) {
        summariesByDate.set(summary.summaryDate, summary);
      }
    }

    return dates
      .map((date) => summariesByDate.get(date))
      .filter((summary): summary is DailySummary => summary !== undefined);
  },

  /**
   * After a business mutation has already committed:
   * 1. Mark the day dirty so getOrRecalculate never treats stored totals as fresh.
   * 2. Schedule the heavy rebuild with Next.js `after()` so Finish can return.
   * Falls back to awaiting the rebuild if scheduling is unavailable.
   */
  async scheduleRecalculationAfterCommit(orgId: string, date: string): Promise<void> {
    try {
      await dailySummaryRepository.markNeedsRecalculation(orgId, date);
    } catch (error) {
      console.error('[daily-summary] markNeedsRecalculation failed before schedule', {
        orgId,
        date,
        error,
      });
      await this.recalculateAfterMutation(orgId, date);
      return;
    }

    const scheduled = scheduleAfterResponse(() => this.recalculateAfterMutation(orgId, date));

    if (!scheduled) {
      await this.recalculateAfterMutation(orgId, date);
    }
  },

  /**
   * Cheap dirty-state update after inventory has already committed.
   * Does not schedule the heavy rebuild — callers that complete many
   * same-day documents (Sales Import) mark dirty per success, then
   * scheduleRecalculationAfterCommit once per distinct date.
   * Never throws: a mark failure falls back to the same best-effort rebuild
   * used by scheduleRecalculationAfterCommit so the day is not left looking fresh.
   */
  async markDirtyAfterCommit(orgId: string, date: string): Promise<void> {
    try {
      await dailySummaryRepository.markNeedsRecalculation(orgId, date);
    } catch (error) {
      console.error('[daily-summary] markNeedsRecalculation failed after commit', {
        orgId,
        date,
        error,
      });
      await this.recalculateAfterMutation(orgId, date);
    }
  },

  /**
   * Best-effort summary refresh after a business mutation has already committed.
   * Never throws — failures are logged and the day is marked for repair on next report load.
   */
  async recalculateAfterMutation(orgId: string, date: string): Promise<void> {
    try {
      await this.recalculate(orgId, date);
    } catch (error) {
      console.error('[daily-summary] recalculate failed after mutation', {
        orgId,
        date,
        error,
      });

      try {
        await dailySummaryRepository.markNeedsRecalculation(orgId, date);
      } catch (markError) {
        console.error('[daily-summary] markNeedsRecalculation failed', {
          orgId,
          date,
          error: markError,
        });
      }
    }
  },

  async recalculate(orgId: string, date: string): Promise<DailySummary> {
    let lastConflict: unknown = null;

    for (let attempt = 1; attempt <= MAX_RECALCULATION_ATTEMPTS; attempt += 1) {
      const existing = await dailySummaryRepository.getByDate(orgId, date);
      const expectedVersion = existing?.version ?? 0;

      const [
        daySales,
        dayExpenses,
        dayProduction,
        dayWastage,
        dayPurchases,
        saleOutCogsFromMovements,
        productionCostFromMovements,
        wastageCostFromMovements,
      ] = await Promise.all([
        saleRepository.listCompletedByDate(orgId, date),
        expenseRepository.listCompletedByDate(orgId, date),
        productionRepository.listCompletedByDate(orgId, date),
        wastageRepository.listCompletedByDate(orgId, date),
        purchaseRepository.listReceivedByDate(orgId, date),
        inventoryMovementRepository.sumTotalCostByMovementType(orgId, date, 'SALE_OUT'),
        inventoryMovementRepository.sumTotalCostByMovementType(
          orgId,
          date,
          'PRODUCTION_FINISHED_IN',
        ),
        inventoryMovementRepository.sumTotalCostByMovementType(orgId, date, 'WASTAGE_OUT'),
      ]);

      const totalSalesRevenue = daySales.reduce((sum, sale) => sum + sale.subtotal, 0);
      const totalSalesDiscount = 0;
      const totalNetSales = totalSalesRevenue - totalSalesDiscount;
      const totalCogsFromDocuments = daySales.reduce((sum, sale) => sum + sale.totalCogs, 0);
      const totalCogs = resolveCostTotal(totalCogsFromDocuments, saleOutCogsFromMovements);

      const expensesByCategory: DailySummaryExpensesByCategory = {};

      for (const expense of dayExpenses) {
        const category = expense.category as ExpenseCategory;
        expensesByCategory[category] = (expensesByCategory[category] ?? 0) + expense.amount;
      }

      const totalExpenses = dayExpenses.reduce((sum, expense) => sum + expense.amount, 0);
      const totalWastageCostFromDocuments = dayWastage.reduce(
        (sum, entry) => sum + entry.totalWastageCost,
        0,
      );
      const totalWastageCost = resolveCostTotal(
        totalWastageCostFromDocuments,
        wastageCostFromMovements,
      );

      const totalProductionUnits = dayProduction.reduce((sum, entry) => sum + entry.totalUnits, 0);
      const totalProductionCost = productionCostFromMovements;
      const totalPurchases = dayPurchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0);

      const profitMetrics = buildDailySummaryMetrics({
        organizationId: orgId,
        summaryDate: date,
        totalProductionUnits,
        totalProductionCost,
        totalSalesRevenue,
        totalSalesDiscount,
        totalNetSales,
        totalCogs,
        transactionCount: daySales.length,
        totalPurchases,
        totalExpenses,
        expensesByCategory,
        totalWastageCost,
        wastageCount: dayWastage.length,
      });

      try {
        return await dailySummaryRepository.upsertIfVersionMatches(
          orgId,
          {
            organizationId: orgId,
            summaryDate: date,
            totalProductionUnits,
            totalProductionCost,
            totalSalesRevenue,
            totalSalesDiscount,
            totalNetSales,
            totalCogs,
            transactionCount: daySales.length,
            totalPurchases,
            totalExpenses,
            expensesByCategory,
            totalWastageCost,
            wastageCount: dayWastage.length,
            ...profitMetrics,
          },
          expectedVersion,
        );
      } catch (error) {
        if (isDailySummaryVersionConflictError(error) && attempt < MAX_RECALCULATION_ATTEMPTS) {
          lastConflict = error;
          continue;
        }

        throw error;
      }
    }

    throw lastConflict;
  },
};
