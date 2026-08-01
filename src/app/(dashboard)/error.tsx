'use client';

import { useEffect } from 'react';

import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { Button } from '@/components/ui/button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6">
      <LoadErrorAlert
        title="Unable to load this page"
        error={error}
        onRetry={reset}
        isRetrying={false}
      />
      <Button type="button" variant="outline" onClick={() => window.location.assign('/login')}>
        Go to login
      </Button>
    </div>
  );
}
