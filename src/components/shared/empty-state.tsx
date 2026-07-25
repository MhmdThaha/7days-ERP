import type { LucideIcon } from 'lucide-react';
import { Package } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type EmptyStateProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

export function EmptyState({
  title,
  description,
  icon: Icon = Package,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('empty-state-shell', className)}>
      <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
        <Icon className="size-7 text-primary" aria-hidden="true" />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {actionLabel && onAction ? (
        <Button onClick={onAction} size="default">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
