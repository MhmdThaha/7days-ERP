import { MessageSquareText } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DailySummaryDashboardQuickSummaryItem } from '@/types/daily-summary-dashboard';

type DailySummaryQuickSummarySectionProps = {
  items: DailySummaryDashboardQuickSummaryItem[];
};

const toneStyles = {
  positive: 'text-emerald-700 dark:text-emerald-400',
  neutral: 'text-muted-foreground',
  warning: 'text-amber-700 dark:text-amber-400',
  negative: 'text-rose-700 dark:text-rose-400',
} as const;

export function DailySummaryQuickSummarySection({ items }: DailySummaryQuickSummarySectionProps) {
  return (
    <section aria-labelledby="daily-summary-quick-summary-heading" className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquareText className="size-5 text-muted-foreground" aria-hidden="true" />
        <div>
          <h2
            id="daily-summary-quick-summary-heading"
            className="text-lg font-semibold tracking-tight"
          >
            Quick Summary
          </h2>
          <p className="text-sm text-muted-foreground">A plain-language snapshot of today.</p>
        </div>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Today at a glance</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className={cn('flex items-start gap-2 text-sm', toneStyles[item.tone])}
              >
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
                <span>{item.message}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
