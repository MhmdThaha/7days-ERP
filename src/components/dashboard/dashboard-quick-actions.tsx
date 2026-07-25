import Link from 'next/link';
import { Banknote, Factory, ShoppingCart, Wallet } from 'lucide-react';

import { SectionHeader } from '@/components/shared/section-header';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
    <section aria-labelledby="dashboard-actions-heading" className="section-stack">
      <SectionHeader
        title="What should you do next?"
        description="Start a common task with one tap."
        headingId="dashboard-actions-heading"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {visibleActions.map((action) => {
          const Icon = action.icon;

          return (
            <Button
              key={action.label}
              nativeButton={false}
              variant="outline"
              size="lg"
              className={cn(
                'h-auto min-h-24 flex-col gap-2.5 rounded-xl px-3 py-4 text-center text-sm font-semibold shadow-xs',
                'hover:border-primary/30 hover:bg-primary/5',
              )}
              aria-label={action.label}
              render={<Link href={action.href} aria-label={action.label} />}
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              {action.label}
            </Button>
          );
        })}
      </div>
    </section>
  );
}
