import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  Boxes,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Factory,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Trash2,
  Wallet,
} from 'lucide-react';

export type MemberRole = 'owner' | 'manager' | 'production' | 'sales' | 'store';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  module: string;
  roles: MemberRole[];
};

export type NavGroup = {
  items: NavItem[];
};

const allRoles: MemberRole[] = ['owner', 'manager', 'production', 'sales', 'store'];
const managementRoles: MemberRole[] = ['owner', 'manager'];
const productionRoles: MemberRole[] = ['owner', 'manager', 'production'];

export const navGroups: NavGroup[] = [
  {
    items: [
      {
        href: '/',
        label: 'Dashboard',
        icon: LayoutDashboard,
        module: 'dashboard',
        roles: allRoles,
      },
    ],
  },
  {
    items: [
      {
        href: '/products',
        label: 'Products',
        icon: Package,
        module: 'products',
        roles: allRoles,
      },
      {
        href: '/recipes',
        label: 'Recipes',
        icon: ClipboardList,
        module: 'recipes',
        roles: productionRoles,
      },
    ],
  },
  {
    items: [
      {
        href: '/purchases',
        label: 'Purchases',
        icon: ShoppingCart,
        module: 'purchases',
        roles: managementRoles,
      },
      {
        href: '/production',
        label: 'Production',
        icon: Factory,
        module: 'production',
        roles: allRoles,
      },
      {
        href: '/sales',
        label: 'Sales',
        icon: Banknote,
        module: 'sales',
        roles: allRoles,
      },
      {
        href: '/expenses',
        label: 'Expenses',
        icon: Wallet,
        module: 'expenses',
        roles: managementRoles,
      },
      {
        href: '/wastage',
        label: 'Wastage',
        icon: Trash2,
        module: 'wastage',
        roles: ['owner', 'manager', 'production', 'store'],
      },
    ],
  },
  {
    items: [
      {
        href: '/inventory',
        label: 'Inventory',
        icon: Boxes,
        module: 'inventory',
        roles: allRoles,
      },
      {
        href: '/daily-summary',
        label: 'Daily Summary',
        icon: CalendarDays,
        module: 'daily-summary',
        roles: productionRoles,
      },
      {
        href: '/monthly-summary',
        label: 'Monthly Summary',
        icon: CalendarRange,
        module: 'monthly-summary',
        roles: managementRoles,
      },
    ],
  },
  {
    items: [
      {
        href: '/settings',
        label: 'Settings',
        icon: Settings,
        module: 'settings',
        roles: managementRoles,
      },
    ],
  },
];

export const navItems: NavItem[] = navGroups.flatMap((group) => group.items);

export const routeLabels: Record<string, string> = Object.fromEntries(
  navItems.map((item) => [item.href, item.label]),
);
