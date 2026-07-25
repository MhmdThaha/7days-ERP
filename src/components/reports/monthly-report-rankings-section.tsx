import type { ReactNode } from 'react';
import { Award, DollarSign, Trash2 } from 'lucide-react';

import { MoneyDisplay } from '@/components/shared/money-display';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { MonthlyReportProductRank } from '@/types/monthly-report';

type MonthlyReportRankingsSectionProps = {
  topSellingProducts: MonthlyReportProductRank[];
  topRevenueProducts: MonthlyReportProductRank[];
  topWastageProducts: MonthlyReportProductRank[];
};

function ProductRankingTable({
  title,
  icon: Icon,
  products,
  valueColumn,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  icon: typeof Award;
  products: MonthlyReportProductRank[];
  valueColumn: {
    header: string;
    render: (product: MonthlyReportProductRank) => ReactNode;
  };
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} icon={Icon} />
        ) : (
                      <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="hidden sm:table-cell">Code</TableHead>
                  <TableHead className="text-right">{valueColumn.header}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.productId}>
                    <TableCell className="font-medium">{product.productName}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {product.productCode}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {valueColumn.render(product)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function MonthlyReportRankingsSection({
  topSellingProducts,
  topRevenueProducts,
  topWastageProducts,
}: MonthlyReportRankingsSectionProps) {
  return (
    <section aria-labelledby="monthly-report-rankings-heading" className="space-y-4">
      <div>
        <h2 id="monthly-report-rankings-heading" className="text-lg font-semibold tracking-tight">
          Product Performance
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Top performers by volume, revenue, and wastage cost.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ProductRankingTable
          title="Top Selling Products"
          icon={Award}
          products={topSellingProducts}
          valueColumn={{
            header: 'Units Sold',
            render: (product) => product.quantity.toLocaleString('en-IN'),
          }}
          emptyTitle="No sales yet"
          emptyDescription="Completed sales will appear here once products are sold."
        />
        <ProductRankingTable
          title="Top Revenue Products"
          icon={DollarSign}
          products={topRevenueProducts}
          valueColumn={{
            header: 'Revenue',
            render: (product) => <MoneyDisplay amount={product.revenue} />,
          }}
          emptyTitle="No revenue yet"
          emptyDescription="Product revenue rankings will appear after sales are completed."
        />
        <ProductRankingTable
          title="Top Wastage Products"
          icon={Trash2}
          products={topWastageProducts}
          valueColumn={{
            header: 'Wastage Cost',
            render: (product) => <MoneyDisplay amount={product.wastageCost} />,
          }}
          emptyTitle="No wastage recorded"
          emptyDescription="Products with the highest wastage cost will appear here."
        />
      </div>
    </section>
  );
}
