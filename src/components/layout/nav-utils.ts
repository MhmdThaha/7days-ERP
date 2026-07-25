import { navItems } from '@/components/layout/nav-items';

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

const MODULE_SINGULAR_LABELS: Record<string, string> = {
  products: 'Product',
  'raw-materials': 'Ingredient',
  recipes: 'Recipe',
  purchases: 'Purchase',
  production: 'Production',
  sales: 'Sale',
  returns: 'Customer Return',
  expenses: 'Expense',
  wastage: 'Waste Record',
  inventory: 'Inventory',
  reports: "Today's Report",
  'daily-summary': 'Kitchen Dashboard',
  'monthly-summary': 'Month Summary',
  settings: 'Settings',
};

const MODULE_LIST_LABELS: Record<string, string> = {
  products: 'Products',
  'raw-materials': 'Ingredients',
  recipes: 'Recipes',
  purchases: 'Purchases',
  production: 'Production',
  sales: 'Sales',
  returns: 'Customer Returns',
  expenses: 'Expenses',
  wastage: 'Waste & Spoilage',
  inventory: 'Inventory',
  reports: "Today's Report",
  'daily-summary': 'Kitchen Dashboard',
  'monthly-summary': 'Month Summary',
  settings: 'Settings',
};

function getModuleFromPathname(pathname: string): string | null {
  const segment = pathname.split('/').filter(Boolean)[0];
  return segment ?? null;
}

function getModuleListLabel(routeModule: string): string {
  return (
    MODULE_LIST_LABELS[routeModule] ??
    routeModule
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  );
}

function getModuleSingularLabel(routeModule: string): string {
  return MODULE_SINGULAR_LABELS[routeModule] ?? getModuleListLabel(routeModule);
}

function getSubRouteLabel(routeModule: string, segments: string[]): string | null {
  if (segments.length === 1) {
    return null;
  }

  const subPath = segments[1];

  if (subPath === 'new') {
    return `New ${getModuleSingularLabel(routeModule)}`;
  }

  if (segments.length === 3 && segments[2] === 'edit') {
    return `Edit ${getModuleSingularLabel(routeModule)}`;
  }

  if (segments.length === 2 && subPath !== 'new') {
    return `${getModuleSingularLabel(routeModule)} Details`;
  }

  return null;
}

export function getBreadcrumbItems(pathname: string): BreadcrumbItem[] {
  if (pathname === '/') {
    return [];
  }

  const items: BreadcrumbItem[] = [{ label: 'Dashboard', href: '/' }];
  const segments = pathname.split('/').filter(Boolean);
  const routeModule = getModuleFromPathname(pathname);

  const matchedNavItem = navItems
    .filter((item) => item.href !== '/')
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isNavItemActive(pathname, item.href));

  if (matchedNavItem) {
    const isModuleRoot = pathname === matchedNavItem.href;

    items.push({
      label: matchedNavItem.label,
      href: isModuleRoot ? undefined : matchedNavItem.href,
    });

    if (!isModuleRoot && routeModule) {
      const subRouteLabel = getSubRouteLabel(routeModule, segments);

      if (subRouteLabel) {
        items.push({ label: subRouteLabel });
      }
    }

    return items;
  }

  if (routeModule) {
    items.push({ label: getModuleListLabel(routeModule) });

    const subRouteLabel = getSubRouteLabel(routeModule, segments);

    if (subRouteLabel) {
      items.push({ label: subRouteLabel });
    }
  }

  return items;
}
