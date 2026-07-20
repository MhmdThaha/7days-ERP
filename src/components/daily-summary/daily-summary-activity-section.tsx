import Link from 'next/link';
import { Activity } from 'lucide-react';

import { MoneyDisplay } from '@/components/shared/money-display';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DAILY_SUMMARY_ACTIVITY_MODULE_LABELS } from '@/lib/domain/constants/daily-summary-dashboard';
import { formatDisplayTime } from '@/lib/utils/date';
import type { DailySummaryDashboardActivityItem } from '@/types/daily-summary-dashboard';

type DailySummaryActivitySectionProps = {
  activity: DailySummaryDashboardActivityItem[];
};

export function DailySummaryActivitySection({ activity }: DailySummaryActivitySectionProps) {
  return (
    <section aria-labelledby="daily-summary-activity-heading">
      <Card>
        <CardHeader>
          <CardTitle id="daily-summary-activity-heading" className="flex items-center gap-2">
            <Activity className="size-4 text-muted-foreground" aria-hidden="true" />
            Today&apos;s Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No completed activity recorded today yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead className="hidden sm:table-cell">Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activity.map((item) => (
                    <TableRow key={`${item.module}-${item.id}`}>
                      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                        {formatDisplayTime(item.time)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {DAILY_SUMMARY_ACTIVITY_MODULE_LABELS[item.module]}
                        </Badge>
                        <Link
                          href={item.href}
                          className="mt-1 block text-sm font-medium hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:hidden"
                        >
                          {item.description}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden max-w-[320px] truncate sm:table-cell">
                        <Link
                          href={item.href}
                          className="hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {item.description}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.amount !== null ? (
                          <MoneyDisplay amount={item.amount} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
