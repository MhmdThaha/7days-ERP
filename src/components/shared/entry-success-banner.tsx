'use client';

import { CheckCircle2 } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

type EntrySuccessBannerProps = {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
};

export function EntrySuccessBanner({
  title,
  description,
  actionLabel,
  onAction,
}: EntrySuccessBannerProps) {
  return (
    <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-50">
      <CheckCircle2 className="text-emerald-600 dark:text-emerald-400" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{description}</span>
        <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={onAction}>
          {actionLabel}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
