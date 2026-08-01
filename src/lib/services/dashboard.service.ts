import 'server-only';

import { dashboardRepository } from '@/lib/repositories/dashboard.repository';
import { organizationRepository } from '@/lib/repositories/organization.repository';
import { getDateStringInTimezone } from '@/lib/utils/date';
import type { DashboardData } from '@/types/dashboard';

export const dashboardService = {
  async getDashboard(orgId: string): Promise<DashboardData> {
    const timezonePromise = organizationRepository.getTimezone(orgId);
    const staticDataPromise = dashboardRepository.getStaticData(orgId);

    const [timezone, staticData] = await Promise.all([timezonePromise, staticDataPromise]);
    const today = getDateStringInTimezone(timezone);
    const summary = await dashboardRepository.getTodaySummary(orgId, today);

    return {
      ...staticData,
      summary,
    };
  },
};
