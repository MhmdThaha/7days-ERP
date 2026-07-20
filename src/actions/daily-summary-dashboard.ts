'use server';

import { getDevMemberRole } from '@/lib/auth/member-role';
import { canAccessModule } from '@/lib/auth/route-access';
import { DomainError } from '@/lib/domain/errors';
import { getServerOrgContext } from '@/lib/firebase/auth-server';
import { dailySummaryDashboardService } from '@/lib/services/daily-summary-dashboard.service';
import { wrapAction, type ActionResult } from '@/lib/utils/action-result';
import type { DailySummaryDashboardData } from '@/types/daily-summary-dashboard';

export async function getDailySummaryDashboardAction(): Promise<
  ActionResult<DailySummaryDashboardData>
> {
  return wrapAction(async () => {
    if (!canAccessModule('daily-summary', getDevMemberRole())) {
      throw new DomainError('UNAUTHORIZED', 'You do not have permission to view the daily summary.');
    }

    const { orgId } = await getServerOrgContext();
    return dailySummaryDashboardService.getDashboard(orgId);
  });
}
