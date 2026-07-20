import { ClipboardList, Factory, Receipt, ShoppingCart, Trash2 } from 'lucide-react';

import { ReportMetricCard } from '@/components/reports/report-metric-card';
import type { DailySummaryDashboardOperationalMetrics } from '@/types/daily-summary-dashboard';

type DailySummaryOperationalMetricsSectionProps = {
  metrics: DailySummaryDashboardOperationalMetrics;
};

export function DailySummaryOperationalMetricsSection({
  metrics,
}: DailySummaryOperationalMetricsSectionProps) {
  return (
    <section aria-labelledby="daily-summary-metrics-heading" className="space-y-4">
      <div>
        <h2 id="daily-summary-metrics-heading" className="text-lg font-semibold tracking-tight">
          Operational Metrics
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Transaction counts for today&apos;s completed activity.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <ReportMetricCard
          title="Sales"
          value={metrics.salesCount.toLocaleString('en-IN')}
          description="Completed sales today"
          icon={Receipt}
        />
        <ReportMetricCard
          title="Purchases"
          value={metrics.purchasesCount.toLocaleString('en-IN')}
          description="Purchases received today"
          icon={ShoppingCart}
        />
        <ReportMetricCard
          title="Production Batches"
          value={metrics.productionBatchCount.toLocaleString('en-IN')}
          description="Completed batches today"
          icon={Factory}
        />
        <ReportMetricCard
          title="Expenses"
          value={metrics.expensesCount.toLocaleString('en-IN')}
          description="Completed expenses today"
          icon={ClipboardList}
        />
        <ReportMetricCard
          title="Wastage Entries"
          value={metrics.wastageCount.toLocaleString('en-IN')}
          description="Completed wastage today"
          icon={Trash2}
        />
      </div>
    </section>
  );
}
