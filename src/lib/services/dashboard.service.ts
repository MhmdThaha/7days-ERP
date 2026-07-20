import 'server-only';

import { dashboardRepository } from '@/lib/repositories/dashboard.repository';
import { organizationRepository } from '@/lib/repositories/organization.repository';
import { getDateStringInTimezone } from '@/lib/utils/date';
import type { DashboardData } from '@/types/dashboard';

export const dashboardService = {
  async getDashboard(orgId: string): Promise<DashboardData> {
    const timezone = await organizationRepository.getTimezone(orgId);
    const today = getDateStringInTimezone(timezone);

    return dashboardRepository.getData(orgId, today);
  },
};
