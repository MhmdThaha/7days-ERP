import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { BakeryGate } from '@/components/auth/bakery-gate';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { ServerAuthProvider } from '@/providers/server-auth-context';
import { filterNavGroupsByRole, navGroups } from '@/components/layout/nav-items';
import {
  CREATE_BAKERY_PATH,
  DEFAULT_LOGIN_PATH,
} from '@/lib/auth/constants';
import { canAccessModule } from '@/lib/auth/route-access';
import { tryGetAuthenticatedContext } from '@/lib/firebase/auth-server';
import { quickAddActions } from '@/lib/navigation/quick-add-actions';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // [PERF-GLOBAL-TEMP] instrumentation — remove after investigation
  const perfLayoutStart = performance.now();

  const auth = await tryGetAuthenticatedContext();
  console.log(
    `[PERF-GLOBAL][layout] dashboard SSR auth (tryGetAuthenticatedContext): ${(performance.now() - perfLayoutStart).toFixed(0)} ms`,
  );

  if (auth.status === 'unauthorized') {
    redirect(DEFAULT_LOGIN_PATH);
  }

  if (auth.status === 'user_not_found' || auth.status === 'org_not_configured') {
    redirect(CREATE_BAKERY_PATH);
  }

  const { role } = auth.context;
  const sidebarNavGroups = filterNavGroupsByRole(navGroups, role);
  const quickAddModules = quickAddActions
    .filter((action) => canAccessModule(action.module, role))
    .map((action) => action.module);

  console.log(
    `[PERF-GLOBAL][layout] dashboard layout TOTAL (SSR): ${(performance.now() - perfLayoutStart).toFixed(0)} ms`,
  );

  return (
    <ServerAuthProvider verified>
      <BakeryGate>
        <DashboardShell navGroups={sidebarNavGroups} quickAddModules={quickAddModules}>
          {children}
        </DashboardShell>
      </BakeryGate>
    </ServerAuthProvider>
  );
}
