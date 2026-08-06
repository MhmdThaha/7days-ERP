'use client';

import { MoneyDisplay } from '@/components/shared/money-display';
import { Card, CardContent } from '@/components/ui/card';

type SaleTotalBarProps = {
  lineCount: number;
  subtotal: number;
  variant?: 'default' | 'compact';
};

export function SaleTotalBar({ lineCount, subtotal, variant = 'default' }: SaleTotalBarProps) {
  const content = (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
      <div className="flex items-baseline gap-2">
        <p className="text-sm font-medium text-muted-foreground">Product lines</p>
        <p
          className={
            variant === 'compact'
              ? 'text-sm font-medium tabular-nums text-muted-foreground'
              : 'text-lg font-semibold tabular-nums'
          }
        >
          {lineCount}
        </p>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-sm font-medium text-muted-foreground">Subtotal</p>
        <p
          className={
            variant === 'compact'
              ? 'text-2xl font-semibold tabular-nums'
              : 'text-2xl font-semibold tabular-nums'
          }
        >
          <MoneyDisplay amount={subtotal} />
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
          <p className="text-sm font-medium text-muted-foreground">Product lines</p>
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
