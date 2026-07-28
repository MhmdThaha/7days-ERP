import { DashboardPage } from '@/components/dashboard/dashboard-page';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
import { canAccessModule } from '@/lib/auth/route-access';

const quickActionModules = ['sales', 'production', 'purchases', 'expenses'] as const;

export default async function Page() {
  const { role } = await getAuthenticatedContext();
  const allowedQuickActionModules = quickActionModules.filter((module) =>
    canAccessModule(module, role),
  );

  return <DashboardPage allowedQuickActionModules={allowedQuickActionModules} />;
}
