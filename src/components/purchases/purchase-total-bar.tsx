'use client';

import { MoneyDisplay } from '@/components/shared/money-display';
import { Card, CardContent } from '@/components/ui/card';

type PurchaseTotalBarProps = {
  lineItemCount: number;
  grandTotal: number;
};

export function PurchaseTotalBar({ lineItemCount, grandTotal }: PurchaseTotalBarProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Line Items</p>
          <p className="text-lg font-semibold tabular-nums">{lineItemCount}</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-sm font-medium text-muted-foreground">Grand Total</p>
          <p className="text-2xl font-semibold tabular-nums">
            <MoneyDisplay amount={grandTotal} />
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
