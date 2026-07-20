import 'server-only';

import { stockOverviewRepository } from '@/lib/repositories/stock-overview.repository';
import type { StockOverviewData } from '@/types/stock-overview';

export const stockOverviewService = {
  async getOverview(orgId: string): Promise<StockOverviewData> {
    return stockOverviewRepository.getOverview(orgId);
  },
};
