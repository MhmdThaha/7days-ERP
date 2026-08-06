'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Activity } from 'lucide-react';

import { MoneyDisplay } from '@/components/shared/money-display';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DAILY_SUMMARY_ACTIVITY_MODULE_LABELS } from '@/lib/domain/constants/daily-summary-dashboard';
import { cn } from '@/lib/utils';
import { formatDisplayTime } from '@/lib/utils/date';
import type {
  DailySummaryDashboardActivityItem,
  DailySummaryDashboardActivityModule,
} from '@/types/daily-summary-dashboard';

type DailySummaryActivitySectionProps = {
  activity: DailySummaryDashboardActivityItem[];
};

const FILTER_OPTIONS: Array<{ id: 'all' | DailySummaryDashboardActivityModule; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'sale', label: 'Sales' },
  { id: 'production', label: 'Production' },
  { id: 'purchase', label: 'Purchases' },
  { id: 'expense', label: 'Expenses' },
  { id: 'wastage', label: 'Wastage' },
];

const moduleBadgeClass: Record<DailySummaryDashboardActivityModule, string> = {
  sale: 'border-primary/30 bg-primary/10 text-primary',
  production: 'border-primary/20 bg-primary/5 text-primary',
  purchase: 'border-primary/20 bg-primary/5 text-primary',
  expense: 'border-warning/30 bg-warning/10 text-warning-foreground',
  wastage: 'border-destructive/30 bg-destructive/10 text-destructive',
};

export function DailySummaryActivitySection({ activity }: DailySummaryActivitySectionProps) {
  const [activeFilter, setActiveFilter] = useState<'all' | DailySummaryDashboardActivityModule>('all');

  const filteredActivity = useMemo(() => {
    if (activeFilter === 'all') {
      return activity;
    }

    return activity.filter((item) => item.module === activeFilter);
  }, [activeFilter, activity]);

  return (
    <section aria-labelledby="daily-summary-activity-heading" className="section-stack">
      <div className="space-y-1">
        <h2 id="daily-summary-activity-heading" className="text-lg font-semibold tracking-tight">
          Transactions
        </h2>
        <p className="text-sm text-muted-foreground">Today&apos;s completed activity.</p>
      </div>

      <Card className="gap-0 rounded-xl">
        <CardHeader className="space-y-4 pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Activity className="size-4 text-muted-foreground" aria-hidden="true" />
            Today&apos;s Activity
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            {FILTER_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setActiveFilter(option.id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  activeFilter === option.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {filteredActivity.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">No completed activity recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <th className="pb-3 pr-4">Time</th>
                    <th className="pb-3 pr-4">Module</th>
                    <th className="hidden pb-3 pr-4 sm:table-cell">Description</th>
                    <th className="pb-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredActivity.map((item) => (
                    <tr key={`${item.module}-${item.id}`} className="align-top">
                      <td className="py-3 pr-4 tabular-nums text-muted-foreground">
                        {formatDisplayTime(item.time)}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge
                          variant="outline"
                          className={cn('font-medium', moduleBadgeClass[item.module])}
                        >
                          {DAILY_SUMMARY_ACTIVITY_MODULE_LABELS[item.module]}
                        </Badge>
                        <Link
                          href={item.href}
                          className="mt-1 block text-sm font-semibold hover:underline sm:hidden"
                        >
                          {item.description}
                        </Link>
                      </td>
                      <td className="hidden max-w-xs truncate py-3 pr-4 sm:table-cell">
                        <Link href={item.href} className="font-medium hover:underline">
                          {item.description}
                        </Link>
                      </td>
                      <td className="py-3 text-right font-semibold tabular-nums">
                        {item.amount !== null ? (
                          <MoneyDisplay amount={item.amount} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
