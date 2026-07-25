'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Package, Search } from 'lucide-react';

import { StockStatusBadge } from '@/components/shared/stock-status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { StockOverviewProductItem } from '@/types/stock-overview';

type StockOverviewProductsSectionProps = {
  products: StockOverviewProductItem[];
};

function formatStock(value: number, unit: string): string {
  return `${value.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${unit}`;
}

function matchesSearch(product: StockOverviewProductItem, search: string): boolean {
  const term = search.trim().toLowerCase();

  if (!term) {
    return true;
  }

  return (
    product.name.toLowerCase().includes(term) || product.code.toLowerCase().includes(term)
  );
}

export function StockOverviewProductsSection({ products }: StockOverviewProductsSectionProps) {
  const [search, setSearch] = useState('');

  const filteredProducts = useMemo(
    () => products.filter((product) => matchesSearch(product, search)),
    [products, search],
  );

  return (
    <section aria-labelledby="stock-overview-products-heading">
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle id="stock-overview-products-heading" className="flex items-center gap-2">
            <Package className="size-4 text-muted-foreground" aria-hidden="true" />
            Finished Products
          </CardTitle>
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products..."
              className="pl-9"
              aria-label="Search finished products"
            />
          </div>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <EmptyState
              title="No active products"
              description="Add products to track finished goods stock."
              icon={Package}
            />
          ) : filteredProducts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No products match your search.
            </p>
          ) : (
                          <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Code</TableHead>
                    <TableHead className="text-right">Current Stock</TableHead>
                    <TableHead className="hidden md:table-cell">Unit</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <Link
                          href={product.href}
                          className="font-medium hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {product.name}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs sm:table-cell">
                        {product.code}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatStock(product.currentStock, product.unit)}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {product.unit}
                      </TableCell>
                      <TableCell>
                        <StockStatusBadge status={product.status} />
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
