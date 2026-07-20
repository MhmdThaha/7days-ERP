'use client';

import { useQuery } from '@tanstack/react-query';

import { getDailyReportAction } from '@/actions/daily-report';

export function useDailyReport() {
  return useQuery({
    queryKey: ['daily-report'],
    queryFn: async () => {
      const result = await getDailyReportAction();

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
