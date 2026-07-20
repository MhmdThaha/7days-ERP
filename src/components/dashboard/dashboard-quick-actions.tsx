import Link from 'next/link';
import { Banknote, Factory, Plus, ShoppingCart, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';

const actions = [
  {
    label: 'Record Sale',
    href: '/sales/new',
    icon: Banknote,
    module: 'sales',
  },
  {
    label: 'Record Production',
    href: '/production/new',
    icon: Factory,
    module: 'production',
  },
  {
    label: 'Record Purchase',
    href: '/purchases/new',
    icon: ShoppingCart,
    module: 'purchases',
  },
  {
    label: 'Record Expense',
    href: '/expenses/new',
    icon: Wallet,
    module: 'expenses',
  },
] as const;

type DashboardQuickActionsProps = {
  allowedModules: readonly string[];
};

export function DashboardQuickActions({ allowedModules }: DashboardQuickActionsProps) {
  const visibleActions = actions.filter((action) => allowedModules.includes(action.module));

  if (visibleActions.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="dashboard-actions-heading" className="space-y-3">
      <h2 id="dashboard-actions-heading" className="text-sm font-medium text-muted-foreground">
        Quick Actions
      </h2>
      <div className="flex flex-wrap gap-2 sm:gap-3">
        {visibleActions.map((action) => (
          <Button
            key={action.label}
            nativeButton={false}
            variant="outline"
            size="sm"
            className="shadow-sm"
            aria-label={action.label}
            render={<Link href={action.href} aria-label={action.label} />}
          >
            <Plus className="size-4" aria-hidden="true" />
            {action.label}
          </Button>
        ))}
      </div>
    </section>
  );
}
