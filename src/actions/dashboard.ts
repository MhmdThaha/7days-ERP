'use server';

import { getServerOrgContext } from '@/lib/firebase/auth-server';
import { dashboardService } from '@/lib/services/dashboard.service';
import { wrapAction, type ActionResult } from '@/lib/utils/action-result';
import type { DashboardData } from '@/types/dashboard';

export async function getDashboardAction(): Promise<ActionResult<DashboardData>> {
  return wrapAction(async () => {
    const { orgId } = await getServerOrgContext();
    return dashboardService.getDashboard(orgId);
  });
}
