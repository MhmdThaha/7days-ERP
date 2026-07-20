import { AccessDenied } from '@/components/shared/access-denied';
import { DailySummaryPage } from '@/components/daily-summary/daily-summary-page';
import { getDevMemberRole } from '@/lib/auth/member-role';
import { canAccessModule, getModuleAccessDeniedDescription } from '@/lib/auth/route-access';

export default function Page() {
  if (!canAccessModule('daily-summary', getDevMemberRole())) {
    return <AccessDenied description={getModuleAccessDeniedDescription('daily-summary')} />;
  }

  return <DailySummaryPage />;
}
