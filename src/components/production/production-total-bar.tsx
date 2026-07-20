'use client';

import { Card, CardContent } from '@/components/ui/card';

type ProductionTotalBarProps = {
  lineCount: number;
  totalUnits: number;
};

function formatQuantity(value: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

export function ProductionTotalBar({ lineCount, totalUnits }: ProductionTotalBarProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Product Lines</p>
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
