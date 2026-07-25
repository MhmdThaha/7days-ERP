import { Banknote, Factory, Trash2, Wallet } from 'lucide-react';

import { DashboardStatCard } from '@/components/dashboard/dashboard-stat-card';
import { MoneyDisplay } from '@/components/shared/money-display';
import type { DashboardSummary } from '@/types/dashboard';

type DashboardHeroSectionProps = {
  summary: DashboardSummary;
};

function formatUnits(value: number): string {
  return value.toLocaleString('en-IN');
}

export function DashboardHeroSection({ summary }: DashboardHeroSectionProps) {
  const metrics = [
    {
      title: 'Production Today',
      value: formatUnits(summary.todayProductionUnits),
      description: 'Units produced',
      icon: Factory,
      href: '/production',
    },
    {
      title: 'Expenses Today',
      value: <MoneyDisplay amount={summary.todayExpensesTotal} />,
      description: 'Operating costs',
      icon: Wallet,
      href: '/expenses',
    },
    {
      title: 'Wastage Today',
      value: formatUnits(summary.todayWastageUnits),
      description: 'Units written off',
      icon: Trash2,
      href: '/wastage',
    },
  ] as const;

  return (
    <section aria-labelledby="dashboard-money-heading" className="section-stack">
      <div className="space-y-1">
        <h2 id="dashboard-money-heading" className="text-lg font-semibold tracking-tight md:text-xl">
          Did you make money today?
        </h2>
        <p className="text-sm text-muted-foreground">
          Completed sales and today&apos;s operating numbers at a glance.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <DashboardStatCard
            title="Today's Sales"
            value={<MoneyDisplay amount={summary.todaySalesTotal} />}
            description="Money from completed sales"
            icon={Banknote}
            href="/sales"
            variant="hero"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:col-span-7 lg:grid-cols-1 xl:grid-cols-3">
          {metrics.map((metric) => (
            <DashboardStatCard
              key={metric.title}
              title={metric.title}
              value={metric.value}
              description={metric.description}
              icon={metric.icon}
              href={metric.href}
              variant="metric"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
