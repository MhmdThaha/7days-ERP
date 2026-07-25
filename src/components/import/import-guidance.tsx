'use client';

import { Info, TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { ImportGuidanceItem, ImportGuidanceResult } from '@/lib/import/guidance/types';
import { cn } from '@/lib/utils';

export type ImportGuidancePanelProps = {
  guidance: ImportGuidanceResult;
  className?: string;
};

/**
 * Presentation-only panel for Import Guidance messages.
 * All copy is produced by the Import Guidance service.
 */
export function ImportGuidancePanel({ guidance, className }: ImportGuidancePanelProps) {
  if (guidance.items.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      {guidance.items.map((item, index) => (
        <ImportGuidanceAlert key={`${item.code ?? item.title}-${index}`} item={item} />
      ))}
    </div>
  );
}

function ImportGuidanceAlert({ item }: { item: ImportGuidanceItem }) {
  const variant =
    item.severity === 'error'
      ? 'destructive'
      : item.severity === 'warning'
        ? 'warning'
        : 'default';

  const Icon = item.severity === 'info' ? Info : TriangleAlert;

  return (
    <Alert variant={variant}>
      <Icon aria-hidden="true" />
      <AlertTitle>{item.title}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>{item.message}</p>
        {item.recommendation ? <p>{item.recommendation}</p> : null}
      </AlertDescription>
    </Alert>
  );
}
