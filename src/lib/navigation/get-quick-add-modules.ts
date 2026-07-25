import 'server-only';

import { quickAddActions } from '@/lib/navigation/quick-add-actions';
import { getDevMemberRole } from '@/lib/auth/member-role';
import { canAccessModule } from '@/lib/auth/route-access';

export function getQuickAddModulesForRole(): string[] {
  const role = getDevMemberRole();

  return quickAddActions
    .filter((action) => canAccessModule(action.module, role))
    .map((action) => action.module);
}
