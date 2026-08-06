import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { isOutOfStock } from '@/lib/domain/stock-status';
import type { DashboardLowStockProduct, DashboardQuickCounts } from '@/types/dashboard';

type DashboardActionCenterProps = {
  lowStockProducts: DashboardLowStockProduct[];
  counts: DashboardQuickCounts;
};

type ActionLine = {
  tone: 'critical' | 'warning';
  label: string;
};

const PREVIEW_LIMIT = 5;

function buildActionLines(
  lowStockProducts: DashboardLowStockProduct[],
  counts: DashboardQuickCounts,
): ActionLine[] {
  const lines: ActionLine[] = [];

  for (const product of lowStockProducts) {
    lines.push({
      tone: isOutOfStock(product.currentStock) ? 'critical' : 'warning',
      label: `Restock ${product.name}`,
    });
  }

  if (counts.draftProduction > 0) {
    lines.push({
      tone: 'warning',
      label: `Finish ${counts.draftProduction.toLocaleString('en-IN')} Production ${counts.draftProduction === 1 ? 'Draft' : 'Drafts'}`,
    });
  }

  if (counts.draftSales > 0) {
    lines.push({
      tone: 'warning',
      label: `Complete ${counts.draftSales.toLocaleString('en-IN')} Sale ${counts.draftSales === 1 ? 'Draft' : 'Drafts'}`,
    });
  }

  if (counts.draftPurchases > 0) {
    lines.push({
      tone: 'warning',
      label: `Complete ${counts.draftPurchases.toLocaleString('en-IN')} Purchase ${counts.draftPurchases === 1 ? 'Draft' : 'Drafts'}`,
    });
  }

  if (counts.draftExpenses > 0) {
    lines.push({
      tone: 'warning',
      label: `Complete ${counts.draftExpenses.toLocaleString('en-IN')} Expense ${counts.draftExpenses === 1 ? 'Draft' : 'Drafts'}`,
    });
  }

  return lines;
}

function getOpenHref(
  lowStockProducts: DashboardLowStockProduct[],
  counts: DashboardQuickCounts,
): string {
  if (lowStockProducts.length > 0) {
    return '/inventory';
  }

  if (counts.draftProduction > 0) {
    return '/production?status=draft';
  }

  if (counts.draftSales > 0) {
    return '/sales?status=draft';
  }

  if (counts.draftPurchases > 0) {
    return '/purchases?status=draft';
  }

  if (counts.draftExpenses > 0) {
    return '/expenses?status=draft';
  }

  return '/inventory';
}

const toneDotClass = {
  critical: 'bg-destructive',
  warning: 'bg-warning',
} as const;

function AllClearCard() {
  return (
    <Card className="gap-0 border-success/30 bg-success/5 ring-1 ring-success/10">
      <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
        <CheckCircle2 className="size-8 text-success" aria-hidden="true" />
        <p className="text-base font-semibold text-success-foreground">All clear</p>
        <p className="text-sm text-muted-foreground">No urgent actions right now.</p>
      </CardContent>
    </Card>
  );
}

export function DashboardActionCenter({ lowStockProducts, counts }: DashboardActionCenterProps) {
  const actionLines = buildActionLines(lowStockProducts, counts);
  const preview = actionLines.slice(0, PREVIEW_LIMIT);
  const remaining = actionLines.length - preview.length;
  const openHref = getOpenHref(lowStockProducts, counts);

  return (
    <section aria-labelledby="dashboard-action-center-heading" className="section-stack">
      <h2
        id="dashboard-action-center-heading"
        className="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
      >
        Action Center
      </h2>

      {actionLines.length === 0 ? (
        <AllClearCard />
      ) : (
        <Card className="gap-0 border-warning/30 bg-warning/5 ring-1 ring-warning/10">
          <CardContent className="flex flex-col gap-4 pt-4">
            <ul className="space-y-2">
              {preview.map((line, index) => (
                <li key={`${line.label}-${index}`} className="flex items-center gap-2.5">
                  <span
                    className={cn('size-2.5 shrink-0 rounded-full', toneDotClass[line.tone])}
                    aria-hidden="true"
                  />
                  <span className="truncate text-base font-medium">{line.label}</span>
                </li>
              ))}
            </ul>

            {remaining > 0 ? (
              <p className="text-sm text-muted-foreground">
                +{remaining.toLocaleString('en-IN')} more
              </p>
            ) : null}

            <div className="border-t pt-3">
              <Button
                nativeButton={false}
                variant="ghost"
                size="sm"
                className="h-8 px-0 text-warning-foreground hover:text-warning-foreground"
                render={
                  <Link href={openHref}>
                    Open
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                }
              />
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
