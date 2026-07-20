import { navItems, type MemberRole } from '@/components/layout/nav-items';

export function canAccessModule(module: string, role: MemberRole): boolean {
  const item = navItems.find((navItem) => navItem.module === module);

  if (!item) {
    return false;
  }

  return item.roles.includes(role);
}

export function getModuleAccessDeniedDescription(module: string): string {
  const item = navItems.find((navItem) => navItem.module === module);
  const label = item?.label ?? 'This page';

  return `${label} is not available for your role.`;
}

export function canAccessPath(pathname: string, role: MemberRole): boolean {
  const sortedItems = [...navItems].sort((a, b) => b.href.length - a.href.length);

  for (const item of sortedItems) {
    if (item.href === '/') {
      if (pathname === '/') {
        return item.roles.includes(role);
      }

      continue;
    }

    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      return item.roles.includes(role);
    }
  }

  return false;
}
