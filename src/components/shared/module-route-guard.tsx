import type { ReactNode } from 'react';

import { AccessDenied } from '@/components/shared/access-denied';
import { getDevMemberRole } from '@/lib/auth/member-role';
import {
  canAccessModule,
  getModuleAccessDeniedDescription,
} from '@/lib/auth/route-access';

type ModuleRouteGuardProps = {
  module: string;
  children: ReactNode;
};

export function ModuleRouteGuard({ module, children }: ModuleRouteGuardProps) {
  if (!canAccessModule(module, getDevMemberRole())) {
    return <AccessDenied description={getModuleAccessDeniedDescription(module)} />;
  }

  return children;
}
