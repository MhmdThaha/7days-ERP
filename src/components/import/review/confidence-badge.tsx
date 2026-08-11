'use client';

import { Badge } from '@/components/ui/badge';
import type { ConfidenceLevel } from '@/lib/import/services/confidence-engine.service';
import { CONFIDENCE_LEVEL } from '@/lib/import/services/confidence-engine.service';
import { cn } from '@/lib/utils';

const LEVEL_CONFIG: Record<
  ConfidenceLevel,
  { label: string; variant: 'success' | 'info' | 'warning' | 'secondary' | 'destructive' }
> = {
  [CONFIDENCE_LEVEL.VERY_HIGH]: { label: 'Very High', variant: 'success' },
  [CONFIDENCE_LEVEL.HIGH]: { label: 'High', variant: 'info' },
  [CONFIDENCE_LEVEL.MEDIUM]: { label: 'Medium', variant: 'warning' },
  [CONFIDENCE_LEVEL.LOW]: { label: 'Low', variant: 'secondary' },
  [CONFIDENCE_LEVEL.VERY_LOW]: { label: 'Very Low', variant: 'destructive' },
};

type ConfidenceBadgeProps = {
  level: ConfidenceLevel;
  score: number;
  className?: string;
};

/** Displays confidence level text plus numeric score — not color alone. */
export function ConfidenceBadge({ level, score, className }: ConfidenceBadgeProps) {
  const config = LEVEL_CONFIG[level];

  return (
    <Badge variant={config.variant} className={cn('tabular-nums', className)}>
      <span>{config.label}</span>
      <span aria-hidden="true">·</span>
      <span>{Math.round(score)}%</span>
    </Badge>
  );
}

export function confidenceLevelLabel(level: ConfidenceLevel): string {
  return LEVEL_CONFIG[level].label;
}
