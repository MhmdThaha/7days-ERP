import { AccessDenied } from '@/components/shared/access-denied';
import { DailyReportPage } from '@/components/reports/daily-report-page';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
import { canAccessModule, getModuleAccessDeniedDescription } from '@/lib/auth/route-access';

export default async function Page() {
  const { role } = await getAuthenticatedContext();

  if (!canAccessModule('reports', role)) {
    return <AccessDenied description={getModuleAccessDeniedDescription('reports')} />;
  }

  return <DailyReportPage />;
}
