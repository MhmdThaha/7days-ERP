import {
  Banknote,
  Factory,
  Package,
  ShoppingCart,
  Wallet,
  Wheat,
} from 'lucide-react';

import { DashboardStatCard } from '@/components/dashboard/dashboard-stat-card';
import { SectionHeader } from '@/components/shared/section-header';
import type { DashboardQuickCounts } from '@/types/dashboard';

type DashboardQuickCountsProps = {
  counts: DashboardQuickCounts;
};

type QuickCountItem = {
  title: string;
  value: number;
  href: string;
  icon: typeof Package;
  emphasis?: 'default' | 'warning';
};

export function DashboardQuickCountsSection({ counts }: DashboardQuickCountsProps) {
  const inventoryItems: QuickCountItem[] = [
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
  ];

  const draftItems: QuickCountItem[] = [
    {
      title: 'Draft Purchases',
      value: counts.draftPurchases,
      href: '/purchases?status=draft',
      icon: ShoppingCart,
      emphasis: counts.draftPurchases > 0 ? 'warning' : 'default',
    },
    {
      title: 'Draft Production',
      value: counts.draftProduction,
      href: '/production?status=draft',
      icon: Factory,
      emphasis: counts.draftProduction > 0 ? 'warning' : 'default',
    },
    {
      title: 'Draft Sales',
      value: counts.draftSales,
      href: '/sales?status=draft',
      icon: Banknote,
      emphasis: counts.draftSales > 0 ? 'warning' : 'default',
    },
    {
      title: 'Draft Expenses',
      value: counts.draftExpenses,
      href: '/expenses?status=draft',
      icon: Wallet,
      emphasis: counts.draftExpenses > 0 ? 'warning' : 'default',
    },
  ];

  const pendingDraftTotal =
    counts.draftPurchases +
    counts.draftProduction +
    counts.draftSales +
    counts.draftExpenses;

  return (
    <div className="section-stack">
      <SectionHeader
        title="Inventory & pending drafts"
        description={
          pendingDraftTotal > 0
            ? `${pendingDraftTotal.toLocaleString('en-IN')} draft ${pendingDraftTotal === 1 ? 'entry needs' : 'entries need'} completion.`
            : 'No pending drafts right now.'
        }
      />

      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Inventory
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {inventoryItems.map((item) => (
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
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Pending drafts
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {draftItems.map((item) => (
              <DashboardStatCard
                key={item.title}
                title={item.title}
                value={item.value.toLocaleString('en-IN')}
                icon={item.icon}
                href={item.href}
                variant="compact"
                emphasis={item.emphasis}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
