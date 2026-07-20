'use client';

import { useQuery } from '@tanstack/react-query';

import { getStockOverviewAction } from '@/actions/stock-overview';

export function useStockOverview() {
  return useQuery({
    queryKey: ['stock-overview', 'v1'],
    queryFn: async () => {
      const result = await getStockOverviewAction();

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
