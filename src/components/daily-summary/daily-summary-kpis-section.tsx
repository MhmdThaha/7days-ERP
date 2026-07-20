import {
  Banknote,
  Factory,
  Package,
  ShoppingCart,
  TrendingUp,
  Trash2,
  Wallet,
} from 'lucide-react';

import { ReportMetricCard } from '@/components/reports/report-metric-card';
import { MoneyDisplay } from '@/components/shared/money-display';
import type { DailySummaryDashboardKpis } from '@/types/daily-summary-dashboard';

type DailySummaryKpisSectionProps = {
  kpis: DailySummaryDashboardKpis;
};

function formatUnits(value: number): string {
  return `${value.toLocaleString('en-IN')} units`;
}

export function DailySummaryKpisSection({ kpis }: DailySummaryKpisSectionProps) {
  return (
    <section aria-labelledby="daily-summary-kpis-heading" className="space-y-4">
      <div>
        <h2 id="daily-summary-kpis-heading" className="text-lg font-semibold tracking-tight">
          Today&apos;s KPIs
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Financial and operational totals from today&apos;s completed activity.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ReportMetricCard
          title="Today's Sales"
          value={<MoneyDisplay amount={kpis.netSales} />}
          description="Net sales completed today"
          icon={Banknote}
        />
        <ReportMetricCard
          title="Today's Net Profit"
          value={<MoneyDisplay amount={kpis.netProfit} />}
          description="After expenses and wastage"
          icon={TrendingUp}
          variant="emphasis"
        />
        <ReportMetricCard
          title="Today's Gross Profit"
          value={<MoneyDisplay amount={kpis.grossProfit} />}
          description="Net sales minus COGS"
          icon={TrendingUp}
        />
        <ReportMetricCard
          title="Today's COGS"
          value={<MoneyDisplay amount={kpis.totalCogs} />}
          description="Product cost at time of sale"
          icon={Package}
        />
        <ReportMetricCard
          title="Today's Expenses"
          value={<MoneyDisplay amount={kpis.expensesTotal} />}
          description="Operating expenses today"
          icon={Wallet}
        />
        <ReportMetricCard
          title="Today's Wastage"
          value={<MoneyDisplay amount={kpis.wastageCost} />}
          description="Inventory written off today"
          icon={Trash2}
        />
        <ReportMetricCard
          title="Today's Purchases"
          value={<MoneyDisplay amount={kpis.purchasesTotal} />}
          description="Raw material purchases received"
          icon={ShoppingCart}
        />
        <ReportMetricCard
          title="Today's Production"
          value={formatUnits(kpis.productionUnits)}
          description="Units produced today"
          icon={Factory}
        />
      </div>
    </section>
  );
}
