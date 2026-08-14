import 'server-only';

import { DomainError } from '@/lib/domain/errors';
import { buildDailyBusinessStatement } from '@/lib/domain/mappers/daily-business-statement';
import { expenseRepository } from '@/lib/repositories/expense.repository';
import { productionRepository } from '@/lib/repositories/production.repository';
import { returnRepository } from '@/lib/repositories/return.repository';
import { saleRepository } from '@/lib/repositories/sale.repository';
import { wastageRepository } from '@/lib/repositories/wastage.repository';
import { dailySummaryService } from '@/lib/services/daily-summary.service';
import type { DailyBusinessStatement } from '@/types/daily-business-statement';

const REPORT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const dailyBusinessStatementService = {
  async getDailyBusinessStatement(orgId: string, date: string): Promise<DailyBusinessStatement> {
    if (!REPORT_DATE_PATTERN.test(date)) {
      throw new DomainError('VALIDATION_ERROR', 'Report date must be YYYY-MM-DD.');
    }

    const [summary, sales, expenses, production, wastage, returns] = await Promise.all([
      dailySummaryService.getOrRecalculate(orgId, date),
      saleRepository.listCompletedByDateWithLines(orgId, date),
      expenseRepository.listCompletedByDateWithDetails(orgId, date),
      productionRepository.listCompletedByDateWithLines(orgId, date),
      wastageRepository.listCompletedByDateWithLines(orgId, date),
      returnRepository.listCompletedByDateWithLines(orgId, date),
    ]);

    return buildDailyBusinessStatement({
      reportDate: date,
      summary,
      sales,
      expenses,
      production,
      wastage,
      returns,
    });
  },
};
