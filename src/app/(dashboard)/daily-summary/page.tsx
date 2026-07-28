import { AccessDenied } from '@/components/shared/access-denied';
import { DailySummaryPage } from '@/components/daily-summary/daily-summary-page';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
import { canAccessModule, getModuleAccessDeniedDescription } from '@/lib/auth/route-access';

export default async function Page() {
  const { role } = await getAuthenticatedContext();

  if (!canAccessModule('daily-summary', role)) {
    return <AccessDenied description={getModuleAccessDeniedDescription('daily-summary')} />;
  }

  return <DailySummaryPage />;
}
