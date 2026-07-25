import Link from 'next/link';
import { ClipboardList } from 'lucide-react';

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
import { DAILY_REPORT_TRANSACTION_TYPE_LABELS } from '@/lib/domain/constants/daily-report';
import { formatDisplayDate } from '@/lib/utils/date';
import type { DailyReportTransaction } from '@/types/daily-report';

type MonthlyReportTransactionsSectionProps = {
  transactions: DailyReportTransaction[];
};

export function MonthlyReportTransactionsSection({
  transactions,
}: MonthlyReportTransactionsSectionProps) {
  return (
    <section aria-labelledby="monthly-report-transactions-heading">
      <Card>
        <CardHeader>
          <CardTitle id="monthly-report-transactions-heading" className="flex items-center gap-2">
            <ClipboardList className="size-4 text-muted-foreground" aria-hidden="true" />
            Monthly Transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No completed transactions recorded this month.
            </p>
          ) : (
                          <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead className="hidden sm:table-cell">Detail</TableHead>
                    <TableHead className="text-right">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((transaction) => (
                    <TableRow key={`${transaction.type}-${transaction.id}`}>
                      <TableCell>
                        <Badge variant="outline">
                          {DAILY_REPORT_TRANSACTION_TYPE_LABELS[transaction.type]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={transaction.href}
                          className="font-medium hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {transaction.number}
                        </Link>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground sm:hidden">
                          {transaction.detail}
                        </p>
                      </TableCell>
                      <TableCell className="hidden max-w-[240px] truncate sm:table-cell">
                        {transaction.detail}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatDisplayDate(transaction.date)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
