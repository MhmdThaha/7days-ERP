import { AccessDenied } from '@/components/shared/access-denied';
import { MonthlyReportPage } from '@/components/reports/monthly-report-page';
import { getDevMemberRole } from '@/lib/auth/member-role';
import { canAccessModule, getModuleAccessDeniedDescription } from '@/lib/auth/route-access';

export default function Page() {
  if (!canAccessModule('monthly-summary', getDevMemberRole())) {
    return <AccessDenied description={getModuleAccessDeniedDescription('monthly-summary')} />;
  }

  return <MonthlyReportPage />;
}
