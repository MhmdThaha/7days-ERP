import 'server-only';

import { cookies } from 'next/headers';

import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { requireUserRole } from '@/lib/auth/user-role';
import { DomainError } from '@/lib/domain/errors';
import { getAdminAuth } from '@/lib/firebase/admin';
import { userRepository } from '@/lib/repositories/user.repository';
import type { UserRole } from '@/types/user';

export type AuthenticatedContext = {
  orgId: string;
  userId: string;
  role: UserRole;
};

/**
 * Resolves the caller from a verified Firebase session cookie only.
 * Never trust a client-supplied uid.
 */
export async function getAuthenticatedContext(): Promise<AuthenticatedContext> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    throw new DomainError('UNAUTHORIZED', 'Authentication required.');
  }

  let userId: string;

  try {
    const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, true);
    userId = decoded.uid;
  } catch {
    throw new DomainError('UNAUTHORIZED', 'Authentication required.');
  }

  const profile = await userRepository.getById(userId);

  if (!profile) {
    throw new DomainError(
      'USER_NOT_FOUND',
      'User profile not found. Complete bakery setup to continue.',
    );
  }

  if (!profile.organizationId) {
    throw new DomainError(
      'ORG_NOT_CONFIGURED',
      'Organization is not configured for this account.',
    );
  }

  return {
    orgId: profile.organizationId,
    userId,
    role: requireUserRole(profile.role),
  };
}

/**
 * Verified session uid only — for onboarding before an organization exists.
 */
export async function getAuthenticatedUserId(): Promise<string> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    throw new DomainError('UNAUTHORIZED', 'Authentication required.');
  }

  try {
    const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, true);
    return decoded.uid;
  } catch {
    throw new DomainError('UNAUTHORIZED', 'Authentication required.');
  }
}
