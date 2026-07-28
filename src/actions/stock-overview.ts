'use server';

import { assertCan } from '@/lib/domain/permissions';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
import { stockOverviewService } from '@/lib/services/stock-overview.service';
import { wrapAction, type ActionResult } from '@/lib/utils/action-result';
import type { StockOverviewData } from '@/types/stock-overview';

export async function getStockOverviewAction(): Promise<ActionResult<StockOverviewData>> {
  return wrapAction(async () => {
    const { orgId, role } = await getAuthenticatedContext();
    assertCan(role, 'read', 'inventory');
    return stockOverviewService.getOverview(orgId);
  });
}
