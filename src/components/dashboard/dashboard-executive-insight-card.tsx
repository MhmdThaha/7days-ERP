import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { MoneyDisplay } from '@/components/shared/money-display';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DashboardQuickCounts, DashboardSummary } from '@/types/dashboard';

type DashboardExecutiveInsightCardProps = {
  summary: DashboardSummary;
  lowStockCount: number;
  counts: DashboardQuickCounts;
};

function formatUnits(value: number): string {
  return value.toLocaleString('en-IN');
}

function getActionLineCount(lowStockCount: number, counts: DashboardQuickCounts): number {
  let count = lowStockCount;

  if (counts.draftProduction > 0) {
    count += 1;
  }

  if (counts.draftSales > 0) {
    count += 1;
  }

  if (counts.draftPurchases > 0) {
    count += 1;
  }

  if (counts.draftExpenses > 0) {
    count += 1;
  }

  return count;
}

export function DashboardExecutiveInsightCard({
  summary,
  lowStockCount,
  counts,
}: DashboardExecutiveInsightCardProps) {
  const actionLineCount = getActionLineCount(lowStockCount, counts);
  const inventoryHealthy = lowStockCount === 0;

  return (
    <section aria-labelledby="dashboard-insight-heading" className="section-stack">
      <Card className="gap-0 bg-muted/30">
        <CardContent className="space-y-4 pt-5">
          <div className="space-y-1">
            <h2 id="dashboard-insight-heading" className="text-lg font-semibold tracking-tight">
              Today&apos;s Business
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Gross Sales
              </p>
              <p className="text-2xl font-bold tracking-tight text-primary tabular-nums">
                <MoneyDisplay amount={summary.todaySalesTotal} />
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Produced
              </p>
              <p className="text-2xl font-bold tracking-tight tabular-nums">
                {formatUnits(summary.todayProductionUnits)} units
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Expenses
              </p>
              <p className="text-2xl font-bold tracking-tight text-muted-foreground tabular-nums">
                <MoneyDisplay amount={summary.todayExpensesTotal} />
              </p>
            </div>
          </div>

          <div className="space-y-1 border-t pt-4 text-sm leading-relaxed">
            <p
              className={cn(
                'font-medium',
                inventoryHealthy ? 'text-success-foreground' : 'text-warning-foreground',
              )}
            >
              {inventoryHealthy
                ? 'Inventory looks healthy.'
                : `${lowStockCount.toLocaleString('en-IN')} ${lowStockCount === 1 ? 'product needs' : 'products need'} restocking.`}
            </p>
            <p className="text-muted-foreground">
              {actionLineCount === 0
                ? 'No actions require attention.'
                : `${actionLineCount.toLocaleString('en-IN')} ${actionLineCount === 1 ? 'action requires' : 'actions require'} attention.`}
            </p>
          </div>

          <div className="border-t pt-3">
            <Button
              nativeButton={false}
              variant="ghost"
              size="sm"
              className="h-8 px-0 text-primary"
              render={
                <Link href="/daily-summary">
                  View profit and trends in Daily Summary
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              }
            />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
