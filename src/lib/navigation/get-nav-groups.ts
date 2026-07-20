import 'server-only';

import { filterNavGroupsByRole, navGroups, type NavGroupConfig } from '@/components/layout/nav-items';
import { getDevMemberRole } from '@/lib/auth/member-role';

export function getNavGroupsForSidebar(): NavGroupConfig[] {
  return filterNavGroupsByRole(navGroups, getDevMemberRole());
}
