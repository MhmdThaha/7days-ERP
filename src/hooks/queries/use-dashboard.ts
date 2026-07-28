'use client';

import { useQuery } from '@tanstack/react-query';

import { getDashboardAction } from '@/actions/dashboard';
import { useAuth } from '@/hooks/use-auth';

export function useDashboard() {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['dashboard', user?.uid],
    queryFn: async () => {
      const result = await getDashboardAction();

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
