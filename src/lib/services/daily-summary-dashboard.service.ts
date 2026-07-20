import 'server-only';

import { dailySummaryDashboardRepository } from '@/lib/repositories/daily-summary-dashboard.repository';
import { organizationRepository } from '@/lib/repositories/organization.repository';
import { getDateStringInTimezone } from '@/lib/utils/date';
import type { DailySummaryDashboardData } from '@/types/daily-summary-dashboard';

export const dailySummaryDashboardService = {
  async getDashboard(orgId: string): Promise<DailySummaryDashboardData> {
    const timezone = await organizationRepository.getTimezone(orgId);
    const today = getDateStringInTimezone(timezone);

    return dailySummaryDashboardRepository.getDashboard(orgId, today);
  },
};
