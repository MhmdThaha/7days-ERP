export type MemberRole = 'owner' | 'manager' | 'production' | 'sales' | 'store';

export type NavIconName =
  | 'LayoutDashboard'
  | 'Package'
  | 'Wheat'
  | 'ClipboardList'
  | 'ShoppingCart'
  | 'Factory'
  | 'Banknote'
  | 'RotateCcw'
  | 'Wallet'
  | 'Trash2'
  | 'FileText'
  | 'Boxes'
  | 'CalendarDays'
  | 'CalendarRange'
  | 'Settings';

export type NavItemConfig = {
  href: string;
  label: string;
  icon: NavIconName;
  module: string;
  roles: readonly MemberRole[];
};

export type NavGroupConfig = {
  id: string;
  items: readonly NavItemConfig[];
};

const allRoles = ['owner', 'manager', 'production', 'sales', 'store'] as const satisfies readonly MemberRole[];
const managementRoles = ['owner', 'manager'] as const satisfies readonly MemberRole[];
const productionRoles = ['owner', 'manager', 'production'] as const satisfies readonly MemberRole[];

export const navGroups: readonly NavGroupConfig[] = [
  {
    id: 'home',
    items: [
      {
        href: '/',
        label: 'Dashboard',
        icon: 'LayoutDashboard',
        module: 'dashboard',
        roles: allRoles,
      },
    ],
  },
  {
    id: 'catalog',
    items: [
      {
        href: '/products',
        label: 'Products',
        icon: 'Package',
        module: 'products',
        roles: allRoles,
      },
      {
        href: '/raw-materials',
        label: 'Raw Materials',
        icon: 'Wheat',
        module: 'raw-materials',
        roles: productionRoles,
      },
      {
        href: '/recipes',
        label: 'Recipes',
        icon: 'ClipboardList',
        module: 'recipes',
        roles: productionRoles,
      },
    ],
  },
  {
    id: 'operations',
    items: [
      {
        href: '/purchases',
        label: 'Purchases',
        icon: 'ShoppingCart',
        module: 'purchases',
        roles: managementRoles,
      },
      {
        href: '/production',
        label: 'Production',
        icon: 'Factory',
        module: 'production',
        roles: allRoles,
      },
      {
        href: '/sales',
        label: 'Sales',
        icon: 'Banknote',
        module: 'sales',
        roles: allRoles,
      },
      {
        href: '/returns',
        label: 'Returns',
        icon: 'RotateCcw',
        module: 'returns',
        roles: allRoles,
      },
      {
        href: '/expenses',
        label: 'Expenses',
        icon: 'Wallet',
        module: 'expenses',
        roles: managementRoles,
      },
      {
        href: '/wastage',
        label: 'Wastage',
        icon: 'Trash2',
        module: 'wastage',
        roles: ['owner', 'manager', 'production', 'store'],
      },
    ],
  },
  {
    id: 'reporting',
    items: [
      {
        href: '/reports',
        label: 'Daily Report',
        icon: 'FileText',
        module: 'reports',
        roles: managementRoles,
      },
      {
        href: '/inventory',
        label: 'Inventory',
        icon: 'Boxes',
        module: 'inventory',
        roles: allRoles,
      },
      {
        href: '/daily-summary',
        label: 'Daily Summary',
        icon: 'CalendarDays',
        module: 'daily-summary',
        roles: productionRoles,
      },
      {
        href: '/monthly-summary',
        label: 'Monthly Summary',
        icon: 'CalendarRange',
        module: 'monthly-summary',
        roles: managementRoles,
      },
    ],
  },
  {
    id: 'settings',
    items: [
      {
        href: '/settings',
        label: 'Settings',
        icon: 'Settings',
        module: 'settings',
        roles: managementRoles,
      },
    ],
  },
] as const;

export const navItems: NavItemConfig[] = navGroups.flatMap((group) => [...group.items]);

export const routeLabels: Record<string, string> = Object.fromEntries(
  navItems.map((item) => [item.href, item.label]),
);

export function filterNavGroupsByRole(
  groups: readonly NavGroupConfig[],
  role: MemberRole,
): NavGroupConfig[] {
  return groups
    .map((group) => ({
      id: group.id,
      items: group.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);
}
