'use client';

import { useQuery } from '@tanstack/react-query';

import { getMonthlyReportAction } from '@/actions/monthly-report';
import { useAuth } from '@/hooks/use-auth';

export function useMonthlyReport() {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['monthly-report', 'v2', user?.uid],
    queryFn: async () => {
      const result = await getMonthlyReportAction();

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
