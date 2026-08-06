'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardList } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DAILY_REPORT_TRANSACTION_TYPE_LABELS } from '@/lib/domain/constants/daily-report';
import { cn } from '@/lib/utils';
import { formatDisplayDate } from '@/lib/utils/date';
import type { DailyReportTransaction, DailyReportTransactionType } from '@/types/daily-report';

type ReportTransactionsSectionProps = {
  transactions: DailyReportTransaction[];
  title?: string;
  emptyMessage?: string;
};

const FILTER_OPTIONS: Array<{ id: 'all' | DailyReportTransactionType; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'sale', label: 'Sales' },
  { id: 'production', label: 'Production' },
  { id: 'expense', label: 'Expenses' },
  { id: 'wastage', label: 'Wastage' },
  { id: 'return', label: 'Returns' },
];

const typeBadgeClass: Record<DailyReportTransactionType, string> = {
  sale: 'border-primary/30 bg-primary/10 text-primary',
  production: 'border-primary/20 bg-primary/5 text-primary',
  expense: 'border-warning/30 bg-warning/10 text-warning-foreground',
  wastage: 'border-destructive/30 bg-destructive/10 text-destructive',
  return: 'border-border bg-muted text-muted-foreground',
};

export function ReportTransactionsSection({
  transactions,
  title = "Today's Transactions",
  emptyMessage = 'No completed transactions recorded.',
}: ReportTransactionsSectionProps) {
  const [activeFilter, setActiveFilter] = useState<'all' | DailyReportTransactionType>('all');

  const filteredTransactions = useMemo(() => {
    if (activeFilter === 'all') {
      return transactions;
    }

    return transactions.filter((transaction) => transaction.type === activeFilter);
  }, [activeFilter, transactions]);

  return (
    <section aria-labelledby="report-transactions-heading" className="section-stack">
      <div className="space-y-1">
        <h2 id="report-transactions-heading" className="text-lg font-semibold tracking-tight">
          Transactions
        </h2>
        <p className="text-sm text-muted-foreground">Detailed records — filter by type below.</p>
      </div>

      <Card className="gap-0 rounded-xl">
        <CardHeader className="space-y-4 pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <ClipboardList className="size-4 text-muted-foreground" aria-hidden="true" />
            {title}
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
          {filteredTransactions.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <th className="pb-3 pr-4">Type</th>
                    <th className="pb-3 pr-4">Number</th>
                    <th className="hidden pb-3 pr-4 sm:table-cell">Detail</th>
                    <th className="pb-3 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredTransactions.map((transaction) => (
                    <tr key={`${transaction.type}-${transaction.id}`} className="align-top">
                      <td className="py-3 pr-4">
                        <Badge
                          variant="outline"
                          className={cn('font-medium', typeBadgeClass[transaction.type])}
                        >
                          {DAILY_REPORT_TRANSACTION_TYPE_LABELS[transaction.type]}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">
                        <Link
                          href={transaction.href}
                          className="font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {transaction.number}
                        </Link>
                        <p className="mt-1 truncate text-xs text-muted-foreground sm:hidden">
                          {transaction.detail}
                        </p>
                      </td>
                      <td className="hidden max-w-xs truncate py-3 pr-4 text-muted-foreground sm:table-cell">
                        {transaction.detail}
                      </td>
                      <td className="py-3 text-right tabular-nums text-muted-foreground">
                        {formatDisplayDate(transaction.date)}
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
