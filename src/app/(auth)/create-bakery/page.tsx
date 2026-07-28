'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { getUserProfileAction } from '@/actions/bakery';
import { AuthShell } from '@/components/auth/auth-shell';
import { CreateBakeryForm } from '@/components/auth/create-bakery-form';
import { useAuth } from '@/hooks/use-auth';
import { DEFAULT_AUTHENTICATED_PATH, DEFAULT_LOGIN_PATH } from '@/lib/auth/constants';

export default function CreateBakeryPage() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated || !user?.uid) {
      router.replace(DEFAULT_LOGIN_PATH);
      return;
    }

    let cancelled = false;

    void getUserProfileAction().then((result) => {
      if (cancelled) {
        return;
      }

      if (result.success && result.data) {
        router.replace(DEFAULT_AUTHENTICATED_PATH);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading, router, user?.uid]);

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <AuthShell
      title="Create your bakery"
      description="Set up your bakery workspace. One account owns one bakery."
    >
      <CreateBakeryForm />
    </AuthShell>
  );
}
