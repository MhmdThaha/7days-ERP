'use client';

import { useQuery } from '@tanstack/react-query';

import { getDailyReportAction } from '@/actions/daily-report';
import { useAuth } from '@/hooks/use-auth';

export function useDailyReport() {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['daily-report', user?.uid],
    queryFn: async () => {
      const result = await getDailyReportAction();

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
