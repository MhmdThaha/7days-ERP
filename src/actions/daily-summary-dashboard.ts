'use server';

import { assertCan } from '@/lib/domain/permissions';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
import { dailySummaryDashboardService } from '@/lib/services/daily-summary-dashboard.service';
import { wrapAction, type ActionResult } from '@/lib/utils/action-result';
import type { DailySummaryDashboardData } from '@/types/daily-summary-dashboard';

export async function getDailySummaryDashboardAction(): Promise<
  ActionResult<DailySummaryDashboardData>
> {
  return wrapAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'dailySummary');
    return dailySummaryDashboardService.getDashboard(orgId);
  });
}
