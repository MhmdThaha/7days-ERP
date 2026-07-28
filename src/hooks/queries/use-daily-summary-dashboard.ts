'use client';

import { useQuery } from '@tanstack/react-query';

import { getDailySummaryDashboardAction } from '@/actions/daily-summary-dashboard';
import { useAuth } from '@/hooks/use-auth';

export function useDailySummaryDashboard() {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['daily-summary-dashboard', 'v1', user?.uid],
    queryFn: async () => {
      const result = await getDailySummaryDashboardAction();

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: isAuthenticated,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
