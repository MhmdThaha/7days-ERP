import {
  Banknote,
  Factory,
  Package,
  Percent,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Trash2,
  Wallet,
} from 'lucide-react';

import { ReportMetricCard } from '@/components/reports/report-metric-card';
import { MoneyDisplay } from '@/components/shared/money-display';
import type { MonthlyReportExecutiveKpis } from '@/types/monthly-report';

type MonthlyReportExecutiveKpisSectionProps = {
  kpis: MonthlyReportExecutiveKpis;
};

function formatPercent(value: number | null): string {
  if (value === null) {
    return '—';
  }

  return `${value.toFixed(1)}%`;
}

function formatUnits(value: number): string {
  return `${value.toLocaleString('en-IN')} units`;
}

export function MonthlyReportExecutiveKpisSection({ kpis }: MonthlyReportExecutiveKpisSectionProps) {
  return (
    <section aria-labelledby="monthly-report-kpis-heading" className="space-y-4">
      <div>
        <h2 id="monthly-report-kpis-heading" className="text-lg font-semibold tracking-tight">
          Executive Overview
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          High-level KPIs for sales, profit, operations, and inventory.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <ReportMetricCard
          title="Total Sales"
          value={<MoneyDisplay amount={kpis.totalSales} />}
          description={`${kpis.salesCount.toLocaleString('en-IN')} completed sales`}
          icon={Banknote}
        />
        <ReportMetricCard
          title="Net Profit"
          value={<MoneyDisplay amount={kpis.netProfit} />}
          description="After expenses and wastage"
          icon={TrendingUp}
          variant="emphasis"
        />
        <ReportMetricCard
          title="Gross Margin"
          value={formatPercent(kpis.grossMarginPercent)}
          description="Gross profit as % of sales"
          icon={Percent}
        />
        <ReportMetricCard
          title="Average Sale Value"
          value={
            kpis.averageSaleValue !== null ? (
              <MoneyDisplay amount={kpis.averageSaleValue} />
            ) : (
              '—'
            )
          }
          description="Net sales per completed sale"
          icon={Receipt}
        />
        <ReportMetricCard
          title="Production Units"
          value={formatUnits(kpis.productionUnits)}
          description="Total units produced"
          icon={Factory}
        />
        <ReportMetricCard
          title="Purchase Amount"
          value={<MoneyDisplay amount={kpis.purchaseAmount} />}
          description="Raw material purchases received"
          icon={ShoppingCart}
        />
        <ReportMetricCard
          title="Wastage"
          value={formatPercent(kpis.wastagePercent)}
          description="Wastage cost as % of sales"
          icon={Trash2}
        />
        <ReportMetricCard
          title="Expense Total"
          value={<MoneyDisplay amount={kpis.expenseTotal} />}
          description="Operating expenses this month"
          icon={Wallet}
        />
        <ReportMetricCard
          title="Inventory Value"
          value={
            kpis.inventoryValue !== null ? (
              <MoneyDisplay amount={kpis.inventoryValue} />
            ) : (
              '—'
            )
          }
          description="Products and raw materials at cost"
          icon={Package}
        />
      </div>
    </section>
  );
}
