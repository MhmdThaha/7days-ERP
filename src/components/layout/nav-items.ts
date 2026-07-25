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
  /** Hidden from primary sidebar groups for cashier/store roles; shown under "More". */
  operatorSecondary?: boolean;
};

export type NavGroupConfig = {
  id: string;
  label?: string;
  items: readonly NavItemConfig[];
};

const allRoles = ['owner', 'manager', 'production', 'sales', 'store'] as const satisfies readonly MemberRole[];
const managementRoles = ['owner', 'manager'] as const satisfies readonly MemberRole[];
const productionRoles = ['owner', 'manager', 'production'] as const satisfies readonly MemberRole[];
const operatorRoles = ['sales', 'store'] as const satisfies readonly MemberRole[];

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
    id: 'daily-work',
    label: "Today's Work",
    items: [
      {
        href: '/sales',
        label: 'Sales',
        icon: 'Banknote',
        module: 'sales',
        roles: allRoles,
      },
      {
        href: '/production',
        label: 'Production',
        icon: 'Factory',
        module: 'production',
        roles: allRoles,
        operatorSecondary: true,
      },
      {
        href: '/purchases',
        label: 'Purchases',
        icon: 'ShoppingCart',
        module: 'purchases',
        roles: managementRoles,
      },
      {
        href: '/returns',
        label: 'Customer Returns',
        icon: 'RotateCcw',
        module: 'returns',
        roles: allRoles,
        operatorSecondary: true,
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
        label: 'Waste & Spoilage',
        icon: 'Trash2',
        module: 'wastage',
        roles: ['owner', 'manager', 'production', 'store'],
      },
    ],
  },
  {
    id: 'setup',
    label: 'Your Bakery',
    items: [
      {
        href: '/products',
        label: 'Products',
        icon: 'Package',
        module: 'products',
        roles: allRoles,
      },
      {
        href: '/recipes',
        label: 'Recipes',
        icon: 'ClipboardList',
        module: 'recipes',
        roles: productionRoles,
      },
      {
        href: '/raw-materials',
        label: 'Ingredients',
        icon: 'Wheat',
        module: 'raw-materials',
        roles: productionRoles,
      },
    ],
  },
  {
    id: 'stock-reports',
    label: 'Stock & Reports',
    items: [
      {
        href: '/inventory',
        label: 'Inventory',
        icon: 'Boxes',
        module: 'inventory',
        roles: allRoles,
      },
      {
        href: '/reports',
        label: "Today's Report",
        icon: 'FileText',
        module: 'reports',
        roles: managementRoles,
      },
      {
        href: '/daily-summary',
        label: 'Kitchen Dashboard',
        icon: 'CalendarDays',
        module: 'daily-summary',
        roles: productionRoles,
      },
      {
        href: '/monthly-summary',
        label: 'Month Summary',
        icon: 'CalendarRange',
        module: 'monthly-summary',
        roles: managementRoles,
      },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
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

function isOperatorRole(role: MemberRole): role is (typeof operatorRoles)[number] {
  return (operatorRoles as readonly MemberRole[]).includes(role);
}

function splitOperatorNavGroups(groups: NavGroupConfig[]): NavGroupConfig[] {
  const moreItems: NavItemConfig[] = [];
  const primaryGroups: NavGroupConfig[] = [];

  for (const group of groups) {
    const primaryItems = group.items.filter((item) => {
      if (!item.operatorSecondary) {
        return true;
      }

      moreItems.push(item);
      return false;
    });

    if (primaryItems.length > 0) {
      primaryGroups.push({
        id: group.id,
        label: group.label,
        items: primaryItems,
      });
    }
  }

  if (moreItems.length === 0) {
    return primaryGroups;
  }

  return [
    ...primaryGroups,
    {
      id: 'more',
      label: 'More',
      items: moreItems,
    },
  ];
}

export function filterNavGroupsByRole(
  groups: readonly NavGroupConfig[],
  role: MemberRole,
): NavGroupConfig[] {
  const filtered = groups
    .map((group) => ({
      id: group.id,
      label: group.label,
      items: group.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);

  if (isOperatorRole(role)) {
    return splitOperatorNavGroups(filtered);
  }

  return filtered;
}
