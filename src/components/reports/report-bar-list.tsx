import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type ReportBarListItem = {
  key: string;
  label: ReactNode;
  value: number;
  displayValue: ReactNode;
};

type ReportBarListProps = {
  items: ReportBarListItem[];
  emptyMessage?: string;
  className?: string;
};

export function ReportBarList({
  items,
  emptyMessage = 'No data available.',
  className,
}: ReportBarListProps) {
  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
    );
  }

  const maxValue = Math.max(...items.map((item) => item.value), 1);

  return (
    <ul className={cn('space-y-3', className)}>
      {items.map((item) => {
        const widthPercent = Math.max((item.value / maxValue) * 100, item.value > 0 ? 4 : 0);

        return (
          <li key={item.key} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium">{item.label}</span>
              <span className="shrink-0 font-semibold tabular-nums">{item.displayValue}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/70 transition-all"
                style={{ width: `${widthPercent}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
