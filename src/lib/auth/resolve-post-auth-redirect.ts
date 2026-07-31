'use client';

import { getUserProfileAction } from '@/actions/bakery';
import { CREATE_BAKERY_PATH, DEFAULT_AUTHENTICATED_PATH } from '@/lib/auth/constants';
// TEMP-TRACE: remove after login-hang investigation
import { getActiveLoginTraceId } from '@/lib/observability/auth-trace-context';

/**
 * After sign-in or sign-up, send new users to bakery setup and returning users home.
 */
export async function resolvePostAuthRedirectPath(): Promise<string> {
  // TEMP-TRACE: remove after login-hang investigation
  console.info('[TEMP-TRACE]', {
    TRACE_ID: getActiveLoginTraceId(),
    FUNCTION: 'resolvePostAuthRedirectPath',
    EVENT: 'ENTER',
    CURRENT_URL: typeof window !== 'undefined' ? window.location.href : null,
    NEXT_STEP: 'getUserProfileAction (server action)',
  });

  const result = await getUserProfileAction();

  if (!result.success || !result.data?.organizationId) {
    // TEMP-TRACE: remove after login-hang investigation
    console.info('[TEMP-TRACE]', {
      TRACE_ID: getActiveLoginTraceId(),
      FUNCTION: 'resolvePostAuthRedirectPath',
      EVENT: 'EXIT',
      CURRENT_URL: typeof window !== 'undefined' ? window.location.href : null,
      NEXT_STEP: `caller will router.push('${CREATE_BAKERY_PATH}')`,
      returnedRedirectPath: CREATE_BAKERY_PATH,
      actionSuccess: result.success,
      hasOrganizationId: Boolean(result.success && result.data?.organizationId),
    });
    return CREATE_BAKERY_PATH;
  }

  // TEMP-TRACE: remove after login-hang investigation
  console.info('[TEMP-TRACE]', {
    TRACE_ID: getActiveLoginTraceId(),
    FUNCTION: 'resolvePostAuthRedirectPath',
    EVENT: 'EXIT',
    CURRENT_URL: typeof window !== 'undefined' ? window.location.href : null,
    NEXT_STEP: `caller will router.push('${DEFAULT_AUTHENTICATED_PATH}')`,
    returnedRedirectPath: DEFAULT_AUTHENTICATED_PATH,
    actionSuccess: result.success,
    hasOrganizationId: true,
  });

  return DEFAULT_AUTHENTICATED_PATH;
}
