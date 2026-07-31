'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { DEFAULT_LOGIN_PATH } from '@/lib/auth/constants';
import { useServerSessionVerified } from '@/providers/server-auth-context';

type BakeryGateProps = {
  children: ReactNode;
};

/**
 * Waits for client Firebase auth when SSR has not already validated the session.
 * Dashboard layout passes serverSessionVerified so children render immediately
 * after SSR auth while client session sync completes in parallel.
 */
export function BakeryGate({ children }: BakeryGateProps) {
  const router = useRouter();
  const serverSessionVerified = useServerSessionVerified();
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (serverSessionVerified) {
      return;
    }

    if (isLoading) {
      return;
    }

    if (!isAuthenticated || !user?.uid) {
      router.replace(DEFAULT_LOGIN_PATH);
    }
  }, [isAuthenticated, isLoading, router, serverSessionVerified, user?.uid]);

  if (!serverSessionVerified && (isLoading || !isAuthenticated)) {
    return (
      <div
        className="flex min-h-[50vh] flex-1 items-center justify-center text-sm text-muted-foreground"
        aria-busy="true"
      >
        Loading your bakery...
      </div>
    );
  }

  return children;
}
