'use client';

import { getUserProfileAction } from '@/actions/bakery';
import { CREATE_BAKERY_PATH, DEFAULT_AUTHENTICATED_PATH } from '@/lib/auth/constants';

/**
 * After sign-in or sign-up, send new users to bakery setup and returning users home.
 */
export async function resolvePostAuthRedirectPath(): Promise<string> {
  const result = await getUserProfileAction();

  if (!result.success || !result.data?.organizationId) {
    return CREATE_BAKERY_PATH;
  }

  return DEFAULT_AUTHENTICATED_PATH;
}
