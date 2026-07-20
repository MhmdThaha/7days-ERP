import { Package, PackageX, TriangleAlert, Wheat } from 'lucide-react';

import { ReportMetricCard } from '@/components/reports/report-metric-card';
import type { StockOverviewSummary } from '@/types/stock-overview';

type StockOverviewSummarySectionProps = {
  summary: StockOverviewSummary;
};

export function StockOverviewSummarySection({ summary }: StockOverviewSummarySectionProps) {
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
          description="Active finished products"
          icon={Package}
        />
        <ReportMetricCard
          title="Total Raw Materials"
          value={summary.totalRawMaterials.toLocaleString('en-IN')}
          description="Active ingredients and supplies"
          icon={Wheat}
        />
        <ReportMetricCard
          title="Low Stock Items"
          value={summary.lowStockItems.toLocaleString('en-IN')}
          description="Items at or below reorder level"
          icon={TriangleAlert}
        />
        <ReportMetricCard
          title="Out of Stock Items"
          value={summary.outOfStockItems.toLocaleString('en-IN')}
          description="Items with no stock available"
          icon={PackageX}
        />
      </div>
    </section>
  );
}
