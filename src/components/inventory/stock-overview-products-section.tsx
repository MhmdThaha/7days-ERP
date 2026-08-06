import Link from 'next/link';
import { Package } from 'lucide-react';

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
import type { StockOverviewProductItem } from '@/types/stock-overview';

type StockOverviewProductsSectionProps = {
  products: StockOverviewProductItem[];
  totalCount: number;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
};

const TABLE_CELL_CLASS = 'py-4 text-base';

function formatStock(value: number, unit: string): string {
  return `${value.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${unit}`;
}

export function StockOverviewProductsSection({
  products,
  totalCount,
  hasActiveFilters,
  onClearFilters,
}: StockOverviewProductsSectionProps) {
  return (
    <section aria-labelledby="stock-overview-products-heading">
      <Card>
        <CardHeader>
          <CardTitle id="stock-overview-products-heading" className="flex items-center gap-2">
            <Package className="size-4 text-muted-foreground" aria-hidden="true" />
            Finished Products
          </CardTitle>
        </CardHeader>
        <CardContent>
          {totalCount === 0 ? (
            <EmptyState
              title="No active products"
              description="Add products to track finished goods stock."
              icon={Package}
            />
          ) : products.length === 0 ? (
            <EmptyState
              title="No products match"
              description="Try a different search term or clear your filters."
              icon={Package}
              actionLabel="Clear filters"
              onAction={onClearFilters}
            />
          ) : (
            <div className="relative max-h-[min(70vh,640px)] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                  <TableRow>
                    <TableHead className={TABLE_CELL_CLASS}>Product Name</TableHead>
                    <TableHead className={cn('hidden sm:table-cell', TABLE_CELL_CLASS)}>Code</TableHead>
                    <TableHead className={cn('text-right', TABLE_CELL_CLASS)}>Current Stock</TableHead>
                    <TableHead className={cn('hidden md:table-cell', TABLE_CELL_CLASS)}>Unit</TableHead>
                    <TableHead className={TABLE_CELL_CLASS}>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow
                      key={product.id}
                      className={getStockRowClassName(product.currentStock, product.status)}
                    >
                      <TableCell className={TABLE_CELL_CLASS}>
                        <Link
                          href={product.href}
                          className="font-medium hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {product.name}
                        </Link>
                        {isNegativeStock(product.currentStock) ? (
                          <p className="mt-0.5 text-xs text-destructive">Negative stock</p>
                        ) : null}
                      </TableCell>
                      <TableCell className={cn('hidden font-mono text-xs sm:table-cell', TABLE_CELL_CLASS)}>
                        {product.code}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right tabular-nums',
                          getStockQuantityClassName(product.currentStock, product.status),
                          TABLE_CELL_CLASS,
                        )}
                      >
                        {formatStock(product.currentStock, product.unit)}
                      </TableCell>
                      <TableCell className={cn('hidden text-muted-foreground md:table-cell', TABLE_CELL_CLASS)}>
                        {product.unit}
                      </TableCell>
                      <TableCell className={TABLE_CELL_CLASS}>
                        <StockStatusBadge status={product.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {hasActiveFilters && products.length > 0 ? (
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
