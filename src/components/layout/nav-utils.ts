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

export function getBreadcrumbItems(pathname: string): BreadcrumbItem[] {
  if (pathname === '/') {
    return [];
  }

  const items: BreadcrumbItem[] = [{ label: 'Dashboard', href: '/' }];

  const matchedNavItem = navItems
    .filter((item) => item.href !== '/')
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isNavItemActive(pathname, item.href));

  if (matchedNavItem) {
    items.push({
      label: matchedNavItem.label,
      href: pathname === matchedNavItem.href ? undefined : matchedNavItem.href,
    });
  } else {
    const segment = pathname.split('/').filter(Boolean)[0];
    if (segment) {
      const label = segment
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      items.push({ label });
    }
  }

  return items;
}
