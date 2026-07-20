import { AccessDenied } from '@/components/shared/access-denied';
import { DailyReportPage } from '@/components/reports/daily-report-page';
import { getDevMemberRole } from '@/lib/auth/member-role';
import { canAccessModule, getModuleAccessDeniedDescription } from '@/lib/auth/route-access';

export default function Page() {
  if (!canAccessModule('reports', getDevMemberRole())) {
    return <AccessDenied description={getModuleAccessDeniedDescription('reports')} />;
  }

  return <DailyReportPage />;
}
