'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { getAuthRedirect } from '@/lib/auth/routes';
import { useAuth } from '@/hooks/use-auth';

type UseRequireAuthOptions = {
  redirectTo?: string;
};

/**
 * Client-side route guard for protected pages.
 * Middleware will enforce the same rules server-side in a later phase.
 */
export function useRequireAuth(options?: UseRequireAuthOptions) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const decision = getAuthRedirect(pathname, isAuthenticated);

    if (!decision) {
      return;
    }

    const target = options?.redirectTo ?? decision.redirectTo;

    if (target !== pathname) {
      router.replace(target);
    }
  }, [isAuthenticated, isLoading, options?.redirectTo, pathname, router]);

  return {
    user,
    isLoading,
    isAuthenticated,
  };
}
