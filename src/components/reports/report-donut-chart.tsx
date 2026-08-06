'use client';

import { useMemo } from 'react';

import { MoneyDisplay } from '@/components/shared/money-display';
import { cn } from '@/lib/utils';

export type ReportDonutSegment = {
  key: string;
  label: string;
  value: number;
};

type ReportDonutChartProps = {
  segments: ReportDonutSegment[];
  className?: string;
};

const SEGMENT_COLORS = [
  'stroke-warning',
  'stroke-warning/80',
  'stroke-warning/60',
  'stroke-muted-foreground',
  'stroke-muted-foreground/70',
  'stroke-muted-foreground/50',
] as const;

const SEGMENT_DOT_CLASS = [
  'bg-warning',
  'bg-warning/80',
  'bg-warning/60',
  'bg-muted-foreground',
  'bg-muted-foreground/70',
  'bg-muted-foreground/50',
] as const;

const SIZE = 168;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CENTER = SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function hasDonutChartData(segments: ReportDonutSegment[]): boolean {
  return segments.some((segment) => segment.value > 0);
}

export function ReportDonutChart({ segments, className }: ReportDonutChartProps) {
  const activeSegments = segments.filter((segment) => segment.value > 0);

  const arcs = useMemo(() => {
    const total = activeSegments.reduce((sum, segment) => sum + segment.value, 0);

    if (total <= 0) {
      return [];
    }

    let offset = 0;

    return activeSegments.map((segment, index) => {
      const fraction = segment.value / total;
      const dash = fraction * CIRCUMFERENCE;
      const arc = {
        ...segment,
        colorClass: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
        dotClass: SEGMENT_DOT_CLASS[index % SEGMENT_DOT_CLASS.length],
        dash,
        offset,
        fraction,
      };
      offset += dash;
      return arc;
    });
  }, [activeSegments]);

  if (arcs.length === 0) {
    return null;
  }

  const total = activeSegments.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <div className={cn('flex flex-col gap-6 lg:flex-row lg:items-center', className)}>
      <div className="mx-auto shrink-0">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-hidden="true">
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            className="stroke-muted/80"
            strokeWidth={STROKE}
          />
          {arcs.map((arc) => (
            <circle
              key={arc.key}
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              className={arc.colorClass}
              strokeWidth={STROKE}
              strokeDasharray={`${arc.dash} ${CIRCUMFERENCE - arc.dash}`}
              strokeDashoffset={-arc.offset}
              transform={`rotate(-90 ${CENTER} ${CENTER})`}
              strokeLinecap="butt"
            />
          ))}
        </svg>
      </div>

      <ul className="min-w-0 flex-1 space-y-3">
        {arcs.map((arc) => (
          <li key={arc.key} className="flex items-center justify-between gap-4 text-sm">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={cn('size-2.5 shrink-0 rounded-full', arc.dotClass)} />
              <span className="truncate font-medium">{arc.label}</span>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-semibold tabular-nums">
                <MoneyDisplay amount={arc.value} />
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {(arc.fraction * 100).toFixed(1)}%
              </p>
            </div>
          </li>
        ))}
        <li className="border-t pt-3 text-sm font-semibold tabular-nums">
          Total · <MoneyDisplay amount={total} />
        </li>
      </ul>
    </div>
  );
}
