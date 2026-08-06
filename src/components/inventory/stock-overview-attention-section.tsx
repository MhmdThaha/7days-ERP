import Link from 'next/link';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import {
  getStockQuantityClassName,
  getStockRowClassName,
  sortByStockSeverity,
} from '@/components/inventory/stock-overview-table-utils';
import { StockStatusBadge } from '@/components/shared/stock-status-badge';
import { EmptyState } from '@/components/shared/empty-state';
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
import { cn } from '@/lib/utils';
import type { StockOverviewAttentionItem } from '@/types/stock-overview';

type StockOverviewAttentionSectionProps = {
  items: StockOverviewAttentionItem[];
  totalAttentionCount: number;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
};

const TABLE_CELL_CLASS = 'py-4 text-base';

function formatStock(value: number, unit: string): string {
  return `${value.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${unit}`;
}

export function StockOverviewAttentionSection({
  items,
  totalAttentionCount,
  hasActiveFilters,
  onClearFilters,
}: StockOverviewAttentionSectionProps) {
  const sortedItems = sortByStockSeverity(items);

  return (
    <section id="stock-overview-attention" aria-labelledby="stock-overview-attention-heading">
      <Card>
        <CardHeader>
          <CardTitle id="stock-overview-attention-heading" className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
            Attention Needed
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sortedItems.length === 0 ? (
            totalAttentionCount > 0 && hasActiveFilters ? (
              <EmptyState
                title="No attention items match"
                description="Try a different search term or clear your filters."
                icon={AlertTriangle}
                actionLabel="Clear filters"
                onAction={onClearFilters}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <CheckCircle2 className="size-8 text-success/80" aria-hidden="true" />
                <p className="max-w-sm text-sm text-muted-foreground">
                  All stock levels look healthy. Nothing needs your attention right now.
                </p>
              </div>
            )
          ) : (
            <div className="relative max-h-[min(70vh,640px)] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                  <TableRow>
                    <TableHead className={TABLE_CELL_CLASS}>Item</TableHead>
                    <TableHead className={cn('hidden sm:table-cell', TABLE_CELL_CLASS)}>Type</TableHead>
                    <TableHead className={cn('text-right', TABLE_CELL_CLASS)}>Stock</TableHead>
                    <TableHead className={TABLE_CELL_CLASS}>Status</TableHead>
                    <TableHead className={cn('text-right', TABLE_CELL_CLASS)}>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedItems.map((item) => (
                    <TableRow
                      key={`${item.kind}-${item.id}`}
                      className={getStockRowClassName(item.currentStock, item.status)}
                    >
                      <TableCell className={cn('font-medium', TABLE_CELL_CLASS)}>
                        {item.name}
                        {item.isNegative ? (
                          <p className="mt-0.5 text-xs text-destructive">Negative stock</p>
                        ) : null}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'hidden capitalize text-muted-foreground sm:table-cell',
                          TABLE_CELL_CLASS,
                        )}
                      >
                        {item.kind === 'raw_material' ? 'Raw Material' : 'Product'}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right tabular-nums',
                          getStockQuantityClassName(item.currentStock, item.status),
                          TABLE_CELL_CLASS,
                        )}
                      >
                        {formatStock(item.currentStock, item.unit)}
                      </TableCell>
                      <TableCell className={TABLE_CELL_CLASS}>
                        <StockStatusBadge status={item.status} />
                      </TableCell>
                      <TableCell className={cn('text-right', TABLE_CELL_CLASS)}>
                        <Button
                          nativeButton={false}
                          variant="outline"
                          size="sm"
                          render={<Link href={item.href} />}
                        >
                          {item.actionLabel}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
