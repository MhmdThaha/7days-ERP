'use server';

import { assertCan } from '@/lib/domain/permissions';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
import { dashboardService } from '@/lib/services/dashboard.service';
import { wrapAction, type ActionResult } from '@/lib/utils/action-result';
import type { DashboardData } from '@/types/dashboard';

export async function getDashboardAction(): Promise<ActionResult<DashboardData>> {
  return wrapAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'inventory');
    return dashboardService.getDashboard(orgId);
  });
}
