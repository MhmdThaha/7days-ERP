'use client';

import { useMemo } from 'react';

import { cn } from '@/lib/utils';

export type ReportLineChartPoint = {
  key: string;
  label: string;
  value: number;
};

type ReportLineChartProps = {
  points: ReportLineChartPoint[];
  variant?: 'sales' | 'profit';
  className?: string;
};

const CHART_WIDTH = 560;
const CHART_HEIGHT = 220;
const PADDING = { top: 16, right: 16, bottom: 32, left: 16 };

function hasChartData(points: ReportLineChartPoint[]): boolean {
  return points.some((point) => point.value !== 0);
}

function buildPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return '';
  }

  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

export function ReportLineChart({
  points,
  variant = 'sales',
  className,
}: ReportLineChartProps) {
  const geometry = useMemo(() => {
    const innerWidth = CHART_WIDTH - PADDING.left - PADDING.right;
    const innerHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
    const values = points.map((point) => point.value);

    const minValue = Math.min(0, ...values);
    const maxValue = Math.max(0, ...values);
    const range = maxValue - minValue || 1;

    const scaleY = (value: number) =>
      PADDING.top + innerHeight - ((value - minValue) / range) * innerHeight;

    const scaleX = (index: number) =>
      PADDING.left + (points.length <= 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);

    const plotted = points.map((point, index) => ({
      ...point,
      x: scaleX(index),
      y: scaleY(point.value),
    }));

    const zeroY = scaleY(0);
    const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => PADDING.top + innerHeight * (1 - ratio));

    return { plotted, zeroY, gridLines, minValue, maxValue };
  }, [points]);

  if (!hasChartData(points)) {
    return null;
  }

  const { plotted, zeroY, gridLines } = geometry;
  const path = buildPath(plotted.map(({ x, y }) => ({ x, y })));

  const labelIndexes =
    points.length <= 7
      ? points.map((_, index) => index)
      : [0, Math.floor(points.length / 2), points.length - 1];

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="min-w-[20rem] w-full"
        role="img"
        aria-hidden="true"
      >
        {gridLines.map((y, index) => (
          <line
            key={index}
            x1={PADDING.left}
            x2={CHART_WIDTH - PADDING.right}
            y1={y}
            y2={y}
            className="stroke-border/60"
            strokeWidth={1}
          />
        ))}

        {variant === 'profit' ? (
          <line
            x1={PADDING.left}
            x2={CHART_WIDTH - PADDING.right}
            y1={zeroY}
            y2={zeroY}
            className="stroke-muted-foreground/40"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        ) : null}

        {variant === 'sales' ? (
          <path
            d={path}
            fill="none"
            className="stroke-primary"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          plotted.slice(1).map((point, index) => {
            const previous = plotted[index];
            if (!previous) {
              return null;
            }

            const segmentValue = point.value;
            const strokeClass =
              segmentValue > 0 ? 'stroke-success' : segmentValue < 0 ? 'stroke-destructive' : 'stroke-muted-foreground';

            return (
              <line
                key={`${previous.key}-${point.key}`}
                x1={previous.x}
                y1={previous.y}
                x2={point.x}
                y2={point.y}
                className={strokeClass}
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            );
          })
        )}

        {plotted.map((point) => (
          <circle
            key={point.key}
            cx={point.x}
            cy={point.y}
            r={variant === 'profit' ? 4 : 3.5}
            className={cn(
              variant === 'sales'
                ? 'fill-primary'
                : point.value > 0
                  ? 'fill-success'
                  : point.value < 0
                    ? 'fill-destructive'
                    : 'fill-muted-foreground',
            )}
          />
        ))}

        {labelIndexes.map((index) => {
          const point = plotted[index];
          if (!point) {
            return null;
          }

          return (
            <text
              key={`label-${point.key}`}
              x={point.x}
              y={CHART_HEIGHT - 8}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {point.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export function hasLineChartData(points: ReportLineChartPoint[]): boolean {
  return hasChartData(points);
}
