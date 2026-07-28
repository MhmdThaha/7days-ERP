'use server';

import { assertCan } from '@/lib/domain/permissions';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
import { monthlyReportService } from '@/lib/services/monthly-report.service';
import { wrapAction, type ActionResult } from '@/lib/utils/action-result';
import type { MonthlyReportData } from '@/types/monthly-report';

export async function getMonthlyReportAction(): Promise<ActionResult<MonthlyReportData>> {
  return wrapAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'monthlySummary');
    return monthlyReportService.getMonthlyReport(orgId);
  });
}
