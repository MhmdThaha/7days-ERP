import { ArrowRight, CheckCircle2 } from 'lucide-react';

import {
  getCriticalAttentionItems,
  getLowStockAttentionItems,
} from '@/components/inventory/stock-overview-table-utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { StockOverviewAttentionItem } from '@/types/stock-overview';

type StockOverviewActionCenterProps = {
  attentionItems: StockOverviewAttentionItem[];
  onOpenBuyNow: () => void;
  onOpenLowStock: () => void;
};

const PREVIEW_COUNT = 3;

type ActionCardProps = {
  tone: 'critical' | 'warning';
  title: string;
  items: StockOverviewAttentionItem[];
  onOpen: () => void;
};

function ActionCard({ tone, title, items, onOpen }: ActionCardProps) {
  const preview = items.slice(0, PREVIEW_COUNT);
  const remaining = items.length - preview.length;

  return (
    <Card
      className={cn(
        'gap-0',
        tone === 'critical'
          ? 'border-destructive/30 bg-destructive/5 ring-1 ring-destructive/10'
          : 'border-warning/30 bg-warning/5 ring-1 ring-warning/10',
      )}
    >
      <CardContent className="flex h-full flex-col gap-3 pt-4">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'size-2.5 shrink-0 rounded-full',
              tone === 'critical' ? 'bg-destructive' : 'bg-warning',
            )}
            aria-hidden="true"
          />
          <p
            className={cn(
              'text-xs font-semibold tracking-wide uppercase',
              tone === 'critical' ? 'text-destructive' : 'text-warning-foreground',
            )}
          >
            {title}
          </p>
        </div>

        <ul className="space-y-1">
          {preview.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="truncate text-base font-medium">
              {item.name}
            </li>
          ))}
        </ul>

        {remaining > 0 ? (
          <p className="text-sm text-muted-foreground">+{remaining.toLocaleString('en-IN')} more</p>
        ) : null}

        <div className="mt-auto pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 px-0',
              tone === 'critical'
                ? 'text-destructive hover:text-destructive'
                : 'text-warning-foreground hover:text-warning-foreground',
            )}
            onClick={onOpen}
          >
            Open
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function HealthyCard() {
  return (
    <Card className="gap-0 border-success/30 bg-success/5 ring-1 ring-success/10">
      <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
        <CheckCircle2 className="size-8 text-success" aria-hidden="true" />
        <p className="text-base font-semibold text-success-foreground">Inventory Healthy</p>
        <p className="text-sm text-muted-foreground">Everything looks good.</p>
      </CardContent>
    </Card>
  );
}

export function StockOverviewActionCenter({
  attentionItems,
  onOpenBuyNow,
  onOpenLowStock,
}: StockOverviewActionCenterProps) {
  const buyNowItems = getCriticalAttentionItems(attentionItems);
  const lowStockItems = getLowStockAttentionItems(attentionItems);
  const showHealthy = buyNowItems.length === 0 && lowStockItems.length === 0;

  if (showHealthy) {
    return (
      <section aria-labelledby="stock-overview-action-center-heading">
        <h2 id="stock-overview-action-center-heading" className="sr-only">
          Action Center
        </h2>
        <HealthyCard />
      </section>
    );
  }

  return (
    <section aria-labelledby="stock-overview-action-center-heading" className="space-y-3">
      <h2
        id="stock-overview-action-center-heading"
        className="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
      >
        Action Center
      </h2>
      <div
        className={cn(
          'grid gap-4',
          buyNowItems.length > 0 && lowStockItems.length > 0
            ? 'sm:grid-cols-2'
            : 'max-w-md',
        )}
      >
        {buyNowItems.length > 0 ? (
          <ActionCard tone="critical" title="Buy Now" items={buyNowItems} onOpen={onOpenBuyNow} />
        ) : null}
        {lowStockItems.length > 0 ? (
          <ActionCard
            tone="warning"
            title="Low Stock"
            items={lowStockItems}
            onOpen={onOpenLowStock}
          />
        ) : null}
      </div>
    </section>
  );
}
