import type { ReactNode } from 'react';

import { BakeryGate } from '@/components/auth/bakery-gate';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { getNavGroupsForSidebar } from '@/lib/navigation/get-nav-groups';
import { getQuickAddModulesForRole } from '@/lib/navigation/get-quick-add-modules';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const navGroups = await getNavGroupsForSidebar();
  const quickAddModules = await getQuickAddModulesForRole();

  return (
    <BakeryGate>
      <DashboardShell navGroups={navGroups} quickAddModules={quickAddModules}>
        {children}
      </DashboardShell>
    </BakeryGate>
  );
}
