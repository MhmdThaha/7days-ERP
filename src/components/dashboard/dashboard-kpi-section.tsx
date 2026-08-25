import { Banknote, ClipboardList, Factory, Wallet } from 'lucide-react';

import { DashboardStatCard } from '@/components/dashboard/dashboard-stat-card';
import { MoneyDisplay } from '@/components/shared/money-display';
import type { DashboardQuickCounts, DashboardSummary } from '@/types/dashboard';

type DashboardKpiSectionProps = {
  summary: DashboardSummary;
  counts: DashboardQuickCounts;
};

function formatUnits(value: number): string {
  return value.toLocaleString('en-IN');
}

function getPendingDraftHref(counts: DashboardQuickCounts): string | undefined {
  const pendingTotal =
    counts.draftPurchases +
    counts.draftProduction +
    counts.draftSales +
    counts.draftExpenses;

  if (pendingTotal === 0) {
    return undefined;
  }

  if (counts.draftProduction > 0) {
    return '/production?status=draft';
  }

  if (counts.draftSales > 0) {
    return '/sales?status=draft';
  }

  if (counts.draftPurchases > 0) {
    return '/purchases?status=draft';
  }

  if (counts.draftExpenses > 0) {
    return '/expenses?status=draft';
  }

  return undefined;
}

export function DashboardKpiSection({ summary, counts }: DashboardKpiSectionProps) {
  const pendingTotal =
    counts.draftPurchases +
    counts.draftProduction +
    counts.draftSales +
    counts.draftExpenses;

  return (
    <section aria-labelledby="dashboard-kpi-heading" className="section-stack">
      <h2 id="dashboard-kpi-heading" className="sr-only">
        Today&apos;s performance
      </h2>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardStatCard
          title="Today's Gross Sales"
          value={<MoneyDisplay amount={summary.todaySalesTotal} />}
          description="Completed sales before returns"
          icon={Banknote}
          href="/sales"
          variant="metric"
          tone="sales"
        />
        <DashboardStatCard
          title="Production Today"
          value={formatUnits(summary.todayProductionUnits)}
          description="Units produced"
          icon={Factory}
          href="/production"
          variant="metric"
          tone="production"
        />
        <DashboardStatCard
          title="Pending Actions"
          value={pendingTotal.toLocaleString('en-IN')}
          description="Unfinished drafts"
          icon={ClipboardList}
          href={getPendingDraftHref(counts)}
          variant="metric"
          tone="pending"
          emphasis={pendingTotal > 0 ? 'warning' : 'default'}
        />
        <DashboardStatCard
          title="Operating Costs Today"
          value={<MoneyDisplay amount={summary.todayExpensesTotal} />}
          description="Expenses recorded today"
          icon={Wallet}
          href="/expenses"
          variant="metric"
          tone="expenses"
        />
      </div>
    </section>
  );
}
