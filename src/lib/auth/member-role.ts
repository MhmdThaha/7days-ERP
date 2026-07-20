import 'server-only';

import type { MemberRole } from '@/components/layout/nav-items';

const MEMBER_ROLES: MemberRole[] = ['owner', 'manager', 'production', 'sales', 'store'];

const MANAGEMENT_ROLES: MemberRole[] = ['owner', 'manager'];

export function isManagementRole(role: MemberRole): boolean {
  return MANAGEMENT_ROLES.includes(role);
}

export function getDevMemberRole(): MemberRole {
  const role = process.env.DEV_MEMBER_ROLE?.trim();

  if (role && MEMBER_ROLES.includes(role as MemberRole)) {
    return role as MemberRole;
  }

  return 'owner';
}
