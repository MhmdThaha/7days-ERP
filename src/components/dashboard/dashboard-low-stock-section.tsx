import Link from 'next/link';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import { LowStockBadge } from '@/components/shared/low-stock-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { DashboardLowStockProduct } from '@/types/dashboard';

type DashboardLowStockSectionProps = {
  products: DashboardLowStockProduct[];
};

function formatStock(value: number, unit: string): string {
  return `${value.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${unit}`;
}

export function DashboardLowStockSection({ products }: DashboardLowStockSectionProps) {
  return (
    <div aria-labelledby="dashboard-low-stock-heading">
      <Card className={products.length > 0 ? 'border-warning/30 bg-warning/5' : undefined}>
        <CardHeader className="pb-3">
          <CardTitle id="dashboard-low-stock-heading" className="flex items-center gap-2 text-base">
            <AlertTriangle
              className="size-5 shrink-0 text-warning-foreground"
              aria-hidden="true"
            />
            Low stock products
          </CardTitle>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-dashed bg-background/80 px-4 py-5">
              <CheckCircle2 className="size-8 shrink-0 text-success" aria-hidden="true" />
              <div>
                <p className="font-medium text-foreground">Stock levels look healthy</p>
                <p className="text-sm text-muted-foreground">
                  No products are running low right now.
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="hidden sm:table-cell">Code</TableHead>
                  <TableHead className="text-right">Stock left</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <Link
                        href={`/products/${product.id}`}
                        className="font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                      >
                        {product.name}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs sm:table-cell">
                      {product.code}
                    </TableCell>
                    <TableCell className="text-right text-base font-semibold tabular-nums">
                      {formatStock(product.currentStock, product.unit)}
                    </TableCell>
                    <TableCell>
                      <LowStockBadge />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
