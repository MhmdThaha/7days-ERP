'use server';

import { getServerOrgContext } from '@/lib/firebase/auth-server';
import { stockOverviewService } from '@/lib/services/stock-overview.service';
import { wrapAction, type ActionResult } from '@/lib/utils/action-result';
import type { StockOverviewData } from '@/types/stock-overview';

export async function getStockOverviewAction(): Promise<ActionResult<StockOverviewData>> {
  return wrapAction(async () => {
    const { orgId } = await getServerOrgContext();
    return stockOverviewService.getOverview(orgId);
  });
}
