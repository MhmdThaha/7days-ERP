'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { AppBreadcrumbs } from '@/components/layout/app-breadcrumbs';
import { AppSidebar } from '@/components/layout/app-sidebar';
import type { NavGroupConfig } from '@/components/layout/nav-items';
import { TopBar } from '@/components/layout/top-bar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

type DashboardShellProps = {
  children: ReactNode;
  navGroups: NavGroupConfig[];
  quickAddModules: readonly string[];
};

export function DashboardShell({ children, navGroups, quickAddModules }: DashboardShellProps) {
  const pathname = usePathname();
  const showBreadcrumbs = pathname !== '/';

  return (
    <SidebarProvider>
      <AppSidebar navGroups={navGroups} />
      <SidebarInset>
        <TopBar quickAddModules={quickAddModules} />
        {showBreadcrumbs ? (
          <div className="border-b px-4 py-3 md:px-6">
            <AppBreadcrumbs />
          </div>
        ) : null}
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
