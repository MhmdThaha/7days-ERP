import 'server-only';

import { monthlyReportRepository } from '@/lib/repositories/monthly-report.repository';
import { organizationRepository } from '@/lib/repositories/organization.repository';
import { getDateStringInTimezone } from '@/lib/utils/date';
import { getMonthKeyFromDateString } from '@/lib/utils/month';
import type { MonthlyReportData } from '@/types/monthly-report';

export const monthlyReportService = {
  async getMonthlyReport(orgId: string): Promise<MonthlyReportData> {
    const timezone = await organizationRepository.getTimezone(orgId);
    const today = getDateStringInTimezone(timezone);
    const monthKey = getMonthKeyFromDateString(today);

    return monthlyReportRepository.getMonthlyReport(orgId, monthKey);
  },
};
