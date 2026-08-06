'use client';

import type { LucideIcon } from 'lucide-react';
import type { VariantProps } from 'class-variance-authority';

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;
type AlertVariant = NonNullable<VariantProps<typeof Alert>['variant']>;

type DraftActionBannerProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  actionVariant?: ButtonVariant;
  actionSize?: ButtonSize;
  alertVariant?: AlertVariant;
  showAction?: boolean;
};

export function DraftActionBanner({
  title,
  description,
  actionLabel,
  onAction,
  icon: Icon,
  disabled = false,
  actionVariant = 'default',
  actionSize = 'sm',
  alertVariant = 'warning',
  showAction = true,
}: DraftActionBannerProps) {
  const hasAction = showAction && actionLabel && onAction;

  return (
    <Alert variant={alertVariant} className={hasAction ? undefined : 'px-4 py-3'}>
      {Icon ? <Icon aria-hidden="true" /> : null}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      {hasAction ? (
        <AlertAction>
          <Button variant={actionVariant} size={actionSize} onClick={onAction} disabled={disabled}>
            {actionLabel}
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}
