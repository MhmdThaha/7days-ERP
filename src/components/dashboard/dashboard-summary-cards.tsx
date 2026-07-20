import { Banknote, Factory, ShoppingCart, Trash2, TrendingUp, Wallet } from 'lucide-react';

import { DashboardStatCard } from '@/components/dashboard/dashboard-stat-card';
import { MoneyDisplay } from '@/components/shared/money-display';
import { formatDisplayDate } from '@/lib/utils/date';
import type { DashboardSummary } from '@/types/dashboard';

type DashboardSummaryCardsProps = {
  summary: DashboardSummary;
};

function formatUnits(value: number): string {
  return `${value.toLocaleString('en-IN')} units`;
}

export function DashboardSummaryCards({ summary }: DashboardSummaryCardsProps) {
  const todayLabel = formatDisplayDate(summary.todayDate);

  const cards = [
    {
      title: "Today's Sales",
      value: <MoneyDisplay amount={summary.todaySalesTotal} />,
      description: `Completed sales on ${todayLabel}`,
      icon: Banknote,
      href: '/sales',
    },
    {
      title: "Today's Production",
      value: formatUnits(summary.todayProductionUnits),
      description: `Units produced on ${todayLabel}`,
      icon: Factory,
      href: '/production',
    },
    {
      title: "Today's Expenses",
      value: <MoneyDisplay amount={summary.todayExpensesTotal} />,
      description: `Operating costs on ${todayLabel}`,
      icon: Wallet,
      href: '/expenses',
    },
    {
      title: "Today's Wastage",
      value: formatUnits(summary.todayWastageUnits),
      description: `Units written off on ${todayLabel}`,
      icon: Trash2,
      href: '/wastage',
    },
  ] as const;

  return (
    <section aria-labelledby="dashboard-summary-heading" className="space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="size-5 text-primary" aria-hidden="true" />
        <h2 id="dashboard-summary-heading" className="text-lg font-semibold tracking-tight">
          Today at a Glance
        </h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <DashboardStatCard
            key={card.title}
            title={card.title}
            value={card.value}
            description={card.description}
            icon={card.icon}
            href={card.href}
            variant="primary"
          />
        ))}
      </div>
    </section>
  );
}
