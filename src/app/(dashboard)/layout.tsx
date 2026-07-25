import type { ReactNode } from 'react';

import { DashboardShell } from '@/components/layout/dashboard-shell';
import { getNavGroupsForSidebar } from '@/lib/navigation/get-nav-groups';
import { getQuickAddModulesForRole } from '@/lib/navigation/get-quick-add-modules';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const navGroups = getNavGroupsForSidebar();
  const quickAddModules = getQuickAddModulesForRole();

  return (
    <DashboardShell navGroups={navGroups} quickAddModules={quickAddModules}>
      {children}
    </DashboardShell>
  );
}
