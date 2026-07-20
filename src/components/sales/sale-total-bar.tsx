'use client';

import { MoneyDisplay } from '@/components/shared/money-display';
import { Card, CardContent } from '@/components/ui/card';

type SaleTotalBarProps = {
  lineCount: number;
  subtotal: number;
};

export function SaleTotalBar({ lineCount, subtotal }: SaleTotalBarProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Product Lines</p>
          <p className="text-lg font-semibold tabular-nums">{lineCount}</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-sm font-medium text-muted-foreground">Subtotal</p>
          <p className="text-2xl font-semibold tabular-nums">
            <MoneyDisplay amount={subtotal} />
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
