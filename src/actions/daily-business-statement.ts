'use server';

import { assertCan } from '@/lib/domain/permissions';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
import { dailyBusinessStatementService } from '@/lib/services/daily-business-statement.service';
import { wrapAction, type ActionResult } from '@/lib/utils/action-result';
import type { DailyBusinessStatement } from '@/types/daily-business-statement';

export async function getDailyBusinessStatementAction(
  reportDate: string,
): Promise<ActionResult<DailyBusinessStatement>> {
  return wrapAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'reports');
    return dailyBusinessStatementService.getDailyBusinessStatement(orgId, reportDate);
  });
}
