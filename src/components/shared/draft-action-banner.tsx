'use client';

import type { LucideIcon } from 'lucide-react';

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

type DraftActionBannerProps = {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
};

export function DraftActionBanner({
  title,
  description,
  actionLabel,
  onAction,
  icon: Icon,
  disabled = false,
}: DraftActionBannerProps) {
  return (
    <Alert variant="warning">
      {Icon ? <Icon aria-hidden="true" /> : null}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      <AlertAction>
        <Button size="sm" onClick={onAction} disabled={disabled}>
          {actionLabel}
        </Button>
      </AlertAction>
    </Alert>
  );
}
