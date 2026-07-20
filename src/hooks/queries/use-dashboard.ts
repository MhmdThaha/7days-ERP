'use client';

import { useQuery } from '@tanstack/react-query';

import { getDashboardAction } from '@/actions/dashboard';

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const result = await getDashboardAction();

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
