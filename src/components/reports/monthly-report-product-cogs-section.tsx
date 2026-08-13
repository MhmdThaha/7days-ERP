'use client';

import { Package } from 'lucide-react';

import { EmptyState } from '@/components/shared/empty-state';
import { MoneyDisplay } from '@/components/shared/money-display';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { MonthlyReportProductCogsRank } from '@/types/monthly-report';

type MonthlyReportProductCogsSectionProps = {
  productCogsRanks: MonthlyReportProductCogsRank[];
};

export function MonthlyReportProductCogsSection({
  productCogsRanks,
}: MonthlyReportProductCogsSectionProps) {
  return (
    <section aria-labelledby="monthly-report-product-cogs-heading" className="section-stack">
      <div className="space-y-1">
        <h2 id="monthly-report-product-cogs-heading" className="text-lg font-semibold tracking-tight">
          Product COGS
        </h2>
        <p className="text-sm text-muted-foreground">
          Cost and gross profit for completed sales (stored per-line COGS).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Package className="size-4 text-muted-foreground" aria-hidden="true" />
            COGS by Product
          </CardTitle>
        </CardHeader>
        <CardContent>
          {productCogsRanks.length === 0 ? (
            <EmptyState
              title="No completed sales in this month"
              description="When sales are completed, per-line COGS will show here."
              icon={Package}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Quantity Sold</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">COGS</TableHead>
                  <TableHead className="text-right">Gross Profit</TableHead>
                  <TableHead className="text-right">Avg COGS/Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productCogsRanks.map((product) => (
                  <TableRow key={product.productId}>
                    <TableCell className="font-medium">{product.productName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {product.quantitySold.toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <MoneyDisplay amount={product.revenue} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <MoneyDisplay amount={product.cogs} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <MoneyDisplay amount={product.grossProfit} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <MoneyDisplay amount={product.averageCogsPerUnit} />
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

