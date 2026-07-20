import 'server-only';

import { dailyReportRepository } from '@/lib/repositories/daily-report.repository';
import { organizationRepository } from '@/lib/repositories/organization.repository';
import { getDateStringInTimezone } from '@/lib/utils/date';
import type { DailyReportData } from '@/types/daily-report';

export const dailyReportService = {
  async getDailyReport(orgId: string): Promise<DailyReportData> {
    const timezone = await organizationRepository.getTimezone(orgId);
    const today = getDateStringInTimezone(timezone);

    return dailyReportRepository.getDailyReport(orgId, today);
  },
};
