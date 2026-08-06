import Link from 'next/link';
import { Clock3 } from 'lucide-react';

import { SectionHeader } from '@/components/shared/section-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDisplayDate } from '@/lib/utils/date';
import type { DashboardRecentActivity, DashboardRecentActivityItem } from '@/types/dashboard';

type DashboardRecentActivitySectionProps = {
  activity: DashboardRecentActivity;
};

type ActivityGroup = {
  title: string;
  shortTitle: string;
  items: DashboardRecentActivityItem[];
  emptyMessage: string;
};

function getEmptyMessage(title: string): string {
  switch (title) {
    case 'Production':
      return 'No recent production.';
    case 'Sales':
      return 'No recent sales.';
    case 'Wastage':
      return 'No recent wastage.';
    case 'Returns':
      return 'No recent returns.';
    case 'Expenses':
      return 'No recent expenses.';
    default:
      return 'Nothing yet.';
  }
}

function ActivityList({
  items,
  emptyMessage,
}: {
  items: DashboardRecentActivityItem[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return <p className="py-3 text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={item.href}
            className="-mx-2 flex items-start justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{item.number}</p>
              <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
            </div>
            <time
              dateTime={item.date}
              className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums"
            >
              {formatDisplayDate(item.date)}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function DashboardRecentActivitySection({ activity }: DashboardRecentActivitySectionProps) {
  const groups: ActivityGroup[] = [
    {
      title: 'Latest Production',
      shortTitle: 'Production',
      items: activity.production,
      emptyMessage: getEmptyMessage('Production'),
    },
    {
      title: 'Latest Sales',
      shortTitle: 'Sales',
      items: activity.sales,
      emptyMessage: getEmptyMessage('Sales'),
    },
  ];

  return (
    <section aria-labelledby="dashboard-activity-heading" className="section-stack">
      <SectionHeader
        title="Recent activity"
        description="Latest production and sales."
        headingId="dashboard-activity-heading"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((group) => (
          <Card key={group.title} size="sm" className="bg-card/80">
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Clock3 className="size-4 text-muted-foreground" aria-hidden="true" />
                {group.shortTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ActivityList items={group.items} emptyMessage={group.emptyMessage} />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
