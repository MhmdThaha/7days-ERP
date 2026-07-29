'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { DEFAULT_LOGIN_PATH } from '@/lib/auth/constants';

type BakeryGateProps = {
  children: ReactNode;
};

/**
 * Waits for client Firebase auth + session cookie sync. Server layout already
 * verified the session and org — no duplicate profile fetch here.
 */
export function BakeryGate({ children }: BakeryGateProps) {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated || !user?.uid) {
      router.replace(DEFAULT_LOGIN_PATH);
    }
  }, [isAuthenticated, isLoading, router, user?.uid]);

  if (isLoading || !isAuthenticated) {
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
