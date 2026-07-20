'use server';

import { getDevMemberRole, isManagementRole } from '@/lib/auth/member-role';
import { DomainError } from '@/lib/domain/errors';
import { getServerOrgContext } from '@/lib/firebase/auth-server';
import { dailyReportService } from '@/lib/services/daily-report.service';
import { wrapAction, type ActionResult } from '@/lib/utils/action-result';
import type { DailyReportData } from '@/types/daily-report';

export async function getDailyReportAction(): Promise<ActionResult<DailyReportData>> {
  return wrapAction(async () => {
    if (!isManagementRole(getDevMemberRole())) {
      throw new DomainError('UNAUTHORIZED', 'You do not have permission to view reports.');
    }

    const { orgId } = await getServerOrgContext();
    return dailyReportService.getDailyReport(orgId);
  });
}
