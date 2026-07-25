import Link from 'next/link';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import { StockStatusBadge } from '@/components/shared/stock-status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { StockOverviewAttentionItem } from '@/types/stock-overview';

type StockOverviewAttentionSectionProps = {
  items: StockOverviewAttentionItem[];
};

function formatStock(value: number, unit: string): string {
  return `${value.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${unit}`;
}

export function StockOverviewAttentionSection({ items }: StockOverviewAttentionSectionProps) {
  return (
    <section aria-labelledby="stock-overview-attention-heading">
      <Card>
        <CardHeader>
          <CardTitle id="stock-overview-attention-heading" className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-600" aria-hidden="true" />
            Attention Needed
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CheckCircle2 className="size-8 text-emerald-600/80" aria-hidden="true" />
              <p className="max-w-sm text-sm text-muted-foreground">
                All stock levels look healthy. Nothing needs your attention right now.
              </p>
            </div>
          ) : (
                          <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="hidden sm:table-cell">Type</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={`${item.kind}-${item.id}`}>
                      <TableCell className="font-medium">
                        {item.name}
                        {item.isNegative ? (
                          <p className="mt-0.5 text-xs text-rose-600">Negative stock</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden capitalize text-muted-foreground sm:table-cell">
                        {item.kind === 'raw_material' ? 'Raw Material' : 'Product'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatStock(item.currentStock, item.unit)}
                      </TableCell>
                      <TableCell>
                        <StockStatusBadge status={item.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button nativeButton={false} variant="outline" size="sm" render={<Link href={item.href} />}>
                          {item.actionLabel}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
