'use client';

import { useQuery } from '@tanstack/react-query';

import { getDashboardAction } from '@/actions/dashboard';
import { useAuth } from '@/hooks/use-auth';
import { useServerSessionVerified } from '@/providers/server-auth-context';

export function useDashboard() {
  const { isAuthenticated } = useAuth();
  const serverSessionVerified = useServerSessionVerified();

  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const result = await getDashboardAction();

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: serverSessionVerified || isAuthenticated,
    staleTime: 30_000,
  });
}
