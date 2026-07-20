'use client';

import { useQuery } from '@tanstack/react-query';

import { getMonthlyReportAction } from '@/actions/monthly-report';

export function useMonthlyReport() {
  return useQuery({
    queryKey: ['monthly-report', 'v2'],
    queryFn: async () => {
      const result = await getMonthlyReportAction();

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
