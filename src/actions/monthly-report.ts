'use server';

import { getDevMemberRole, isManagementRole } from '@/lib/auth/member-role';
import { DomainError } from '@/lib/domain/errors';
import { getServerOrgContext } from '@/lib/firebase/auth-server';
import { monthlyReportService } from '@/lib/services/monthly-report.service';
import { wrapAction, type ActionResult } from '@/lib/utils/action-result';
import type { MonthlyReportData } from '@/types/monthly-report';

export async function getMonthlyReportAction(): Promise<ActionResult<MonthlyReportData>> {
  return wrapAction(async () => {
    if (!isManagementRole(getDevMemberRole())) {
      throw new DomainError('UNAUTHORIZED', 'You do not have permission to view reports.');
    }

    const { orgId } = await getServerOrgContext();
    return monthlyReportService.getMonthlyReport(orgId);
  });
}
