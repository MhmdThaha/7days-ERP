import type { ReactNode } from 'react';

import { DashboardShell } from '@/components/layout/dashboard-shell';
import { getNavGroupsForSidebar } from '@/lib/navigation/get-nav-groups';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const navGroups = getNavGroupsForSidebar();

  return <DashboardShell navGroups={navGroups}>{children}</DashboardShell>;
}
