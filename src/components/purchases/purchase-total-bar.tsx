'use client';

import { MoneyDisplay } from '@/components/shared/money-display';
import { Card, CardContent } from '@/components/ui/card';

type PurchaseTotalBarProps = {
  lineItemCount: number;
  grandTotal: number;
  variant?: 'default' | 'compact';
  totalLabel?: string;
};

export function PurchaseTotalBar({
  lineItemCount,
  grandTotal,
  variant = 'default',
  totalLabel = 'Final payable',
}: PurchaseTotalBarProps) {
  const content = (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
      <div className="flex items-baseline gap-2">
        <p className="text-sm font-medium text-muted-foreground">Line items</p>
        <p
          className={
            variant === 'compact'
              ? 'text-sm font-medium tabular-nums text-muted-foreground'
              : 'text-lg font-semibold tabular-nums'
          }
        >
          {lineItemCount}
        </p>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-sm font-medium text-muted-foreground">{totalLabel}</p>
        <p
          className={
            variant === 'compact'
              ? 'text-2xl font-semibold tabular-nums'
              : 'text-2xl font-semibold tabular-nums'
          }
        >
          <MoneyDisplay amount={grandTotal} />
        </p>
      </div>
    </div>
  );

  if (variant === 'compact') {
    return content;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Line items</p>
          <p className="text-lg font-semibold tabular-nums">{lineItemCount}</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-sm font-medium text-muted-foreground">{totalLabel}</p>
          <p className="text-2xl font-semibold tabular-nums">
            <MoneyDisplay amount={grandTotal} />
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
