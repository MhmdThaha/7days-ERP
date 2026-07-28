import 'server-only';

import { quickAddActions } from '@/lib/navigation/quick-add-actions';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
import { canAccessModule } from '@/lib/auth/route-access';

export async function getQuickAddModulesForRole(): Promise<string[]> {
  const { role } = await getAuthenticatedContext();

  return quickAddActions
    .filter((action) => canAccessModule(action.module, role))
    .map((action) => action.module);
}
