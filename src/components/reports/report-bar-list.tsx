import type { ReactNode } from 'react';

import {
  reportBarToneClass,
  type ReportBarTone,
} from '@/components/reports/report-tone-utils';
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
  barTone?: ReportBarTone;
  className?: string;
};

export function ReportBarList({
  items,
  emptyMessage = 'No data available.',
  barTone = 'sales',
  className,
}: ReportBarListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  const maxValue = Math.max(...items.map((item) => item.value), 1);

  return (
    <ul className={cn('space-y-4', className)}>
      {items.map((item) => {
        const widthPercent = Math.max((item.value / maxValue) * 100, item.value > 0 ? 6 : 0);

        return (
          <li key={item.key} className="space-y-2">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="min-w-0 truncate font-medium">{item.label}</span>
              <span className="shrink-0 text-base font-semibold tabular-nums">{item.displayValue}</span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-muted/80">
              <div
                className={cn('h-full rounded-full transition-all', reportBarToneClass[barTone])}
                style={{ width: `${widthPercent}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ReportChartCard({
  question,
  children,
}: {
  question: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 sm:p-6">
      <h3 className="mb-5 text-base font-semibold leading-snug tracking-tight">{question}</h3>
      {children}
    </div>
  );
}
