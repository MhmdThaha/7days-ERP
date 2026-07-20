import { DashboardPage } from '@/components/dashboard/dashboard-page';
import { getDevMemberRole } from '@/lib/auth/member-role';
import { canAccessModule } from '@/lib/auth/route-access';

const quickActionModules = ['sales', 'production', 'purchases', 'expenses'] as const;

export default function Page() {
  const role = getDevMemberRole();
  const allowedQuickActionModules = quickActionModules.filter((module) =>
    canAccessModule(module, role),
  );

  return <DashboardPage allowedQuickActionModules={allowedQuickActionModules} />;
}
