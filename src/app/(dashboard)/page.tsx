import { redirect } from 'next/navigation';

import { DashboardPage } from '@/components/dashboard/dashboard-page';
import { CREATE_BAKERY_PATH, DEFAULT_LOGIN_PATH } from '@/lib/auth/constants';
import { canAccessModule } from '@/lib/auth/route-access';
import { tryGetAuthenticatedContext } from '@/lib/firebase/auth-server';

const quickActionModules = ['sales', 'production', 'purchases', 'expenses'] as const;

export default async function Page() {
  const auth = await tryGetAuthenticatedContext();

  if (auth.status === 'unauthorized') {
    redirect(DEFAULT_LOGIN_PATH);
  }

  if (auth.status === 'user_not_found' || auth.status === 'org_not_configured') {
    redirect(CREATE_BAKERY_PATH);
  }

  const { role } = auth.context;
  const allowedQuickActionModules = quickActionModules.filter((module) =>
    canAccessModule(module, role),
  );

  return <DashboardPage allowedQuickActionModules={allowedQuickActionModules} />;
}
