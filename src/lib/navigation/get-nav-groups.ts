import 'server-only';

import { filterNavGroupsByRole, navGroups, type NavGroupConfig } from '@/components/layout/nav-items';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';

export async function getNavGroupsForSidebar(): Promise<NavGroupConfig[]> {
  const { role } = await getAuthenticatedContext();
  return filterNavGroupsByRole(navGroups, role);
}
