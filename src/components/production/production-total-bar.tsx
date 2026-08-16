'use client';

import { Card, CardContent } from '@/components/ui/card';
import { formatProductionQuantityDisplay } from '@/lib/utils/production-quantity-display';

type ProductionTotalBarProps = {
  lineCount: number;
  totalUnits: number;
  variant?: 'default' | 'compact';
};

function formatQuantity(value: number): string {
  return formatProductionQuantityDisplay(value);
}

export function ProductionTotalBar({
  lineCount,
  totalUnits,
  variant = 'default',
}: ProductionTotalBarProps) {
  const content = (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-1">
      <div className="flex items-baseline gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Product lines
        </p>
        <p className="text-sm font-medium tabular-nums text-muted-foreground">{lineCount}</p>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Total units
        </p>
        <p className="text-2xl font-semibold tabular-nums">{formatQuantity(totalUnits)}</p>
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
          <p className="text-sm font-medium text-muted-foreground">Total Units</p>
          <p className="text-2xl font-semibold tabular-nums">{formatQuantity(totalUnits)}</p>
        </div>
      </CardContent>
    </Card>
  );
}
