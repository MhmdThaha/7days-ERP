'use client';

import { useQuery } from '@tanstack/react-query';

import { getDailySummaryDashboardAction } from '@/actions/daily-summary-dashboard';

export function useDailySummaryDashboard() {
  return useQuery({
    queryKey: ['daily-summary-dashboard', 'v1'],
    queryFn: async () => {
      const result = await getDailySummaryDashboardAction();

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
