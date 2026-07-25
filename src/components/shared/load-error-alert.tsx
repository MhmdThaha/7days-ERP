'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { isOrgConfigError, toUserFriendlyLoadError } from '@/lib/utils/user-friendly-error';

type LoadErrorAlertProps = {
  title: string;
  error: Error | null;
  onRetry?: () => void;
  isRetrying?: boolean;
};

export function LoadErrorAlert({
  title,
  error,
  onRetry,
  isRetrying = false,
}: LoadErrorAlertProps) {
  if (!error || isOrgConfigError(error.message)) {
    return null;
  }

  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{toUserFriendlyLoadError(error.message)}</span>
        {onRetry ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 border-destructive/30 bg-background"
            onClick={onRetry}
            disabled={isRetrying}
          >
            {isRetrying ? 'Retrying…' : 'Try again'}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
