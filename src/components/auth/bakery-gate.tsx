'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { getUserProfileAction } from '@/actions/bakery';
import { useAuth } from '@/hooks/use-auth';
import { CREATE_BAKERY_PATH, DEFAULT_LOGIN_PATH } from '@/lib/auth/constants';

type BakeryGateProps = {
  children: ReactNode;
};

export function BakeryGate({ children }: BakeryGateProps) {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (isLoading) {
      setIsReady(false);
      return;
    }

    if (!isAuthenticated || !user?.uid) {
      setIsReady(false);
      router.replace(DEFAULT_LOGIN_PATH);
      return;
    }

    setIsReady(false);
    let cancelled = false;

    void getUserProfileAction().then((result) => {
      if (cancelled) {
        return;
      }

      if (!result.success) {
        setIsReady(false);
        router.replace(DEFAULT_LOGIN_PATH);
        return;
      }

      if (!result.data) {
        setIsReady(false);
        router.replace(CREATE_BAKERY_PATH);
        return;
      }

      setIsReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading, router, user?.uid]);

  if (!isReady) {
    return (
      <div className="flex min-h-[50vh] flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading your bakery...
      </div>
    );
  }

  return children;
}
