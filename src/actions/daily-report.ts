'use server';

import { assertCan } from '@/lib/domain/permissions';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
import { dailyReportService } from '@/lib/services/daily-report.service';
import { wrapAction, type ActionResult } from '@/lib/utils/action-result';
import type { DailyReportData } from '@/types/daily-report';

export async function getDailyReportAction(): Promise<ActionResult<DailyReportData>> {
  return wrapAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'reports');
    return dailyReportService.getDailyReport(orgId);
  });
}
