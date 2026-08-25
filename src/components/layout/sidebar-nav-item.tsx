'use client';

import Link from 'next/link';

import { NAV_ICONS } from '@/components/layout/nav-icons';
import type { NavItemConfig } from '@/components/layout/nav-items';
import { isNavItemActive } from '@/components/layout/nav-utils';
import { useTransactionalSidebarHref } from '@/hooks/use-transactional-sidebar-href';
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';

type SidebarNavItemProps = {
  item: NavItemConfig;
  pathname: string;
};

export function SidebarNavItem({ item, pathname }: SidebarNavItemProps) {
  const Icon = NAV_ICONS[item.icon];
  const href = useTransactionalSidebarHref(item.module, item.href);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isNavItemActive(pathname, item.href)}
        tooltip={item.label}
        render={<Link href={href} />}
      >
        <Icon className="size-4" aria-hidden="true" />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
