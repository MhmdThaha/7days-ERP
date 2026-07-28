import type { ReactNode } from 'react';

import { AccessDenied } from '@/components/shared/access-denied';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
import {
  canAccessModule,
  getModuleAccessDeniedDescription,
} from '@/lib/auth/route-access';

type ModuleRouteGuardProps = {
  module: string;
  children: ReactNode;
};

export async function ModuleRouteGuard({ module, children }: ModuleRouteGuardProps) {
  const { role } = await getAuthenticatedContext();

  if (!canAccessModule(module, role)) {
    return <AccessDenied description={getModuleAccessDeniedDescription(module)} />;
  }

  return children;
}
