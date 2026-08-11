'use client';

import type { ConfidenceLevel } from '@/lib/import/services/confidence-engine.service';
import { cn } from '@/lib/utils';

import { confidenceLevelLabel } from '@/components/import/review/confidence-badge';

type ConfidenceMeterProps = {
  score: number;
  level: ConfidenceLevel;
  className?: string;
};

/** Accessible progress bar for row/file confidence (display only). */
export function ConfidenceMeter({ score, level, className }: ConfidenceMeterProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium">{confidenceLevelLabel(level)}</span>
        <span className="tabular-nums text-muted-foreground">{clamped}%</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-label={`Confidence ${clamped} percent, ${confidenceLevelLabel(level)}`}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
