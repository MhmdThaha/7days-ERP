import Link from 'next/link';
import { Wheat } from 'lucide-react';

import {
  getStockQuantityClassName,
  getStockRowClassName,
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
import { isNegativeStock } from '@/lib/domain/stock-status';
import type { StockOverviewRawMaterialItem } from '@/types/stock-overview';

type StockOverviewRawMaterialsSectionProps = {
  rawMaterials: StockOverviewRawMaterialItem[];
  totalCount: number;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
};

const TABLE_CELL_CLASS = 'py-4 text-base';

function formatStock(value: number, unit: string): string {
  return `${value.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${unit}`;
}

function formatReorderLevel(reorderLevel: number | null, unit: string): string {
  if (reorderLevel === null) {
    return '—';
  }

  return `${reorderLevel.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${unit}`;
}

export function StockOverviewRawMaterialsSection({
  rawMaterials,
  totalCount,
  hasActiveFilters,
  onClearFilters,
}: StockOverviewRawMaterialsSectionProps) {
  return (
    <section aria-labelledby="stock-overview-raw-materials-heading">
      <Card>
        <CardHeader>
          <CardTitle id="stock-overview-raw-materials-heading" className="flex items-center gap-2">
            <Wheat className="size-4 text-muted-foreground" aria-hidden="true" />
            Raw Materials
          </CardTitle>
        </CardHeader>
        <CardContent>
          {totalCount === 0 ? (
            <EmptyState
              title="No active raw materials"
              description="Add raw materials to track ingredient stock."
              icon={Wheat}
            />
          ) : rawMaterials.length === 0 ? (
            <EmptyState
              title="No raw materials match"
              description="Try a different search term or clear your filters."
              icon={Wheat}
              actionLabel="Clear filters"
              onAction={onClearFilters}
            />
          ) : (
            <div className="relative max-h-[min(70vh,640px)] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                  <TableRow>
                    <TableHead className={TABLE_CELL_CLASS}>Raw Material</TableHead>
                    <TableHead className={cn('hidden sm:table-cell', TABLE_CELL_CLASS)}>Code</TableHead>
                    <TableHead className={cn('text-right', TABLE_CELL_CLASS)}>Current Stock</TableHead>
                    <TableHead className={cn('hidden md:table-cell', TABLE_CELL_CLASS)}>Unit</TableHead>
                    <TableHead className={cn('text-right', TABLE_CELL_CLASS)}>Reorder Level</TableHead>
                    <TableHead className={TABLE_CELL_CLASS}>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rawMaterials.map((material) => (
                    <TableRow
                      key={material.id}
                      className={getStockRowClassName(material.currentStock, material.status)}
                    >
                      <TableCell className={TABLE_CELL_CLASS}>
                        <Link
                          href={material.href}
                          className="font-medium hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {material.name}
                        </Link>
                        {isNegativeStock(material.currentStock) ? (
                          <p className="mt-0.5 text-xs text-destructive">Negative stock</p>
                        ) : null}
                      </TableCell>
                      <TableCell className={cn('hidden font-mono text-xs sm:table-cell', TABLE_CELL_CLASS)}>
                        {material.code}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right tabular-nums',
                          getStockQuantityClassName(material.currentStock, material.status),
                          TABLE_CELL_CLASS,
                        )}
                      >
                        {formatStock(material.currentStock, material.unit)}
                      </TableCell>
                      <TableCell className={cn('hidden text-muted-foreground md:table-cell', TABLE_CELL_CLASS)}>
                        {material.unit}
                      </TableCell>
                      <TableCell className={cn('text-right tabular-nums text-muted-foreground', TABLE_CELL_CLASS)}>
                        {formatReorderLevel(material.reorderLevel, material.unit)}
                      </TableCell>
                      <TableCell className={TABLE_CELL_CLASS}>
                        <StockStatusBadge status={material.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {hasActiveFilters && rawMaterials.length > 0 ? (
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={onClearFilters}>
                Clear filters
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
