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
    <section aria-labelledby="dashboard-low-stock-heading">
      <Card>
        <CardHeader>
          <CardTitle id="dashboard-low-stock-heading" className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-600" aria-hidden="true" />
            Low Stock Products
          </CardTitle>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CheckCircle2 className="size-8 text-emerald-600/80" aria-hidden="true" />
              <p className="max-w-sm text-sm text-muted-foreground">
                No low stock products. Inventory looks healthy.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="hidden sm:table-cell">Code</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <Link
                          href={`/products/${product.id}`}
                          className="font-medium hover:underline"
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
                      <TableCell>
                        <LowStockBadge />
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
