import type { NavIconName } from '@/components/layout/nav-items';

export type QuickAddAction = {
  label: string;
  href: string;
  module: string;
  icon: NavIconName;
};

export const quickAddActions: readonly QuickAddAction[] = [
  {
    label: 'New Sale',
    href: '/sales/new',
    module: 'sales',
    icon: 'Banknote',
  },
  {
    label: 'New Production',
    href: '/production/new',
    module: 'production',
    icon: 'Factory',
  },
  {
    label: 'New Purchase',
    href: '/purchases/new',
    module: 'purchases',
    icon: 'ShoppingCart',
  },
  {
    label: 'New Expense',
    href: '/expenses/new',
    module: 'expenses',
    icon: 'Wallet',
  },
  {
    label: 'Record Waste',
    href: '/wastage/new',
    module: 'wastage',
    icon: 'Trash2',
  },
  {
    label: 'Customer Return',
    href: '/returns/new',
    module: 'returns',
    icon: 'RotateCcw',
  },
] as const;
