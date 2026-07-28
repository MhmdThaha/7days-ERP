import { AccessDenied } from '@/components/shared/access-denied';
import { MonthlyReportPage } from '@/components/reports/monthly-report-page';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
import { canAccessModule, getModuleAccessDeniedDescription } from '@/lib/auth/route-access';

export default async function Page() {
  const { role } = await getAuthenticatedContext();

  if (!canAccessModule('monthly-summary', role)) {
    return <AccessDenied description={getModuleAccessDeniedDescription('monthly-summary')} />;
  }

  return <MonthlyReportPage />;
}
