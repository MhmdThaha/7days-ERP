import {
  Banknote,
  Factory,
  Package,
  ShoppingCart,
  Wallet,
  Wheat,
} from 'lucide-react';

import { DashboardStatCard } from '@/components/dashboard/dashboard-stat-card';
import type { DashboardQuickCounts } from '@/types/dashboard';

type DashboardQuickCountsProps = {
  counts: DashboardQuickCounts;
};

type QuickCountItem = {
  title: string;
  value: number;
  href: string;
  icon: typeof Package;
};

export function DashboardQuickCountsSection({ counts }: DashboardQuickCountsProps) {
  const items: QuickCountItem[] = [
    {
      title: 'Active Products',
      value: counts.totalProducts,
      href: '/products',
      icon: Package,
    },
    {
      title: 'Active Raw Materials',
      value: counts.totalRawMaterials,
      href: '/raw-materials',
      icon: Wheat,
    },
    {
      title: 'Draft Purchases',
      value: counts.draftPurchases,
      href: '/purchases?status=draft',
      icon: ShoppingCart,
    },
    {
      title: 'Draft Production',
      value: counts.draftProduction,
      href: '/production?status=draft',
      icon: Factory,
    },
    {
      title: 'Draft Sales',
      value: counts.draftSales,
      href: '/sales?status=draft',
      icon: Banknote,
    },
    {
      title: 'Draft Expenses',
      value: counts.draftExpenses,
      href: '/expenses?status=draft',
      icon: Wallet,
    },
  ];

  return (
    <section
      aria-labelledby="dashboard-counts-heading"
      className="rounded-xl border border-dashed bg-muted/20 px-4 py-5 sm:px-5"
    >
      <h2 id="dashboard-counts-heading" className="mb-3 text-sm font-medium text-muted-foreground">
        Inventory & Pending Drafts
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {items.map((item) => (
          <DashboardStatCard
            key={item.title}
            title={item.title}
            value={item.value.toLocaleString('en-IN')}
            icon={item.icon}
            href={item.href}
            variant="compact"
          />
        ))}
      </div>
    </section>
  );
}
