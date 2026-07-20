import Link from 'next/link';
import { Clock3 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDisplayDate } from '@/lib/utils/date';
import type { DashboardRecentActivity, DashboardRecentActivityItem } from '@/types/dashboard';

type DashboardRecentActivitySectionProps = {
  activity: DashboardRecentActivity;
};

type ActivityGroup = {
  title: string;
  items: DashboardRecentActivityItem[];
  emptyMessage: string;
};

function getEmptyMessage(title: string): string {
  switch (title) {
    case 'Latest Production':
      return 'No recent production recorded.';
    case 'Latest Sales':
      return 'No recent sales recorded.';
    case 'Latest Wastage':
      return 'No recent wastage recorded.';
    case 'Latest Returns':
      return 'No recent returns recorded.';
    case 'Latest Expenses':
      return 'No recent expenses recorded.';
    default:
      return 'Nothing to show yet.';
  }
}

function ActivityList({ items, emptyMessage }: { items: DashboardRecentActivityItem[]; emptyMessage: string }) {
  if (items.length === 0) {
    return (
      <p className="py-4 text-sm leading-relaxed text-muted-foreground">{emptyMessage}</p>
    );
  }

  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={item.href}
            className="-mx-2 flex items-start justify-between gap-3 rounded-md px-2 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="truncate font-medium">{item.number}</p>
              <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
            </div>
            <div className="shrink-0 text-right text-xs text-muted-foreground">
              <p>{formatDisplayDate(item.date)}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function DashboardRecentActivitySection({ activity }: DashboardRecentActivitySectionProps) {
  const groups: ActivityGroup[] = [
    { title: 'Latest Production', items: activity.production, emptyMessage: getEmptyMessage('Latest Production') },
    { title: 'Latest Sales', items: activity.sales, emptyMessage: getEmptyMessage('Latest Sales') },
    { title: 'Latest Wastage', items: activity.wastage, emptyMessage: getEmptyMessage('Latest Wastage') },
    { title: 'Latest Returns', items: activity.returns, emptyMessage: getEmptyMessage('Latest Returns') },
    { title: 'Latest Expenses', items: activity.expenses, emptyMessage: getEmptyMessage('Latest Expenses') },
  ];

  return (
    <section aria-labelledby="dashboard-activity-heading" className="space-y-4 border-t pt-8">
      <div className="flex items-center gap-2">
        <Clock3 className="size-5 text-muted-foreground" aria-hidden="true" />
        <h2 id="dashboard-activity-heading" className="text-base font-semibold text-muted-foreground">
          Recent Activity
        </h2>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <Card key={group.title} className="bg-muted/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{group.title}</CardTitle>
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
