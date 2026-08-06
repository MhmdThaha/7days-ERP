import { Package, PackageX, TriangleAlert, Wheat } from 'lucide-react';

import { ReportMetricCard } from '@/components/reports/report-metric-card';
import { cn } from '@/lib/utils';
import type { StockOverviewSummary } from '@/types/stock-overview';

type StockOverviewSummarySectionProps = {
  summary: StockOverviewSummary;
};

export function StockOverviewSummarySection({ summary }: StockOverviewSummarySectionProps) {
  const hasLowStock = summary.lowStockItems > 0;
  const hasOutOfStock = summary.outOfStockItems > 0;

  return (
    <section aria-labelledby="stock-overview-summary-heading" className="space-y-4">
      <div>
        <h2 id="stock-overview-summary-heading" className="text-lg font-semibold tracking-tight">
          Inventory Summary
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Active products and raw materials in your bakery right now.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ReportMetricCard
          title="Total Products"
          value={summary.totalProducts.toLocaleString('en-IN')}
          description="Finished goods you track and sell"
          icon={Package}
        />
        <ReportMetricCard
          title="Total Raw Materials"
          value={summary.totalRawMaterials.toLocaleString('en-IN')}
          description="Ingredients and supplies on hand"
          icon={Wheat}
        />
        <ReportMetricCard
          title="Low Stock Items"
          value={summary.lowStockItems.toLocaleString('en-IN')}
          description={
            hasLowStock ? 'Running low — plan a reorder soon' : 'Nothing flagged as low right now'
          }
          icon={TriangleAlert}
          className={cn(
            hasLowStock && 'border-warning/30 bg-warning/5 ring-1 ring-warning/10',
          )}
        />
        <ReportMetricCard
          title="Out of Stock Items"
          value={summary.outOfStockItems.toLocaleString('en-IN')}
          description={
            hasOutOfStock ? 'Unavailable — restock before production' : 'No zero-stock items'
          }
          icon={PackageX}
          className={cn(
            hasOutOfStock && 'border-destructive/30 bg-destructive/5 ring-1 ring-destructive/10',
          )}
        />
      </div>
    </section>
  );
}
