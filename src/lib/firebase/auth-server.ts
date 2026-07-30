import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';

import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { requireUserRole } from '@/lib/auth/user-role';
import { DomainError } from '@/lib/domain/errors';
import { getAdminAuth } from '@/lib/firebase/admin';
import { userRepository } from '@/lib/repositories/user.repository';
import type { UserProfile } from '@/types/user';
import type { UserRole } from '@/types/user';

const getCachedUserProfile = cache(async (userId: string): Promise<UserProfile | null> => {
  return userRepository.getById(userId);
});

const getVerifiedSessionUserId = cache(async (): Promise<string> => {
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
});

export type AuthenticatedContext = {
  orgId: string;
  userId: string;
  role: UserRole;
};

export type AuthenticatedContextResult =
  | { status: 'ok'; context: AuthenticatedContext }
  | { status: 'unauthorized' }
  | { status: 'user_not_found' }
  | { status: 'org_not_configured'; userId: string };

async function resolveAuthenticatedContext(): Promise<AuthenticatedContext> {
  // [PERF-GLOBAL-TEMP] instrumentation — remove after investigation
  const perfTotalStart = performance.now();
  let perfLast = perfTotalStart;

  const userId = await getVerifiedSessionUserId();
  const sessionMs = performance.now() - perfLast;
  console.log(`[PERF-GLOBAL][auth] session verification (cookie parse + verifySessionCookie): ${sessionMs.toFixed(0)} ms`);
  perfLast = performance.now();

  const profile = await getCachedUserProfile(userId);
  const userLookupMs = performance.now() - perfLast;
  console.log(`[PERF-GLOBAL][auth] user profile lookup (users/{uid} read, includes orgId): ${userLookupMs.toFixed(0)} ms`);

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

  console.log(
    `[PERF-GLOBAL][auth] getAuthenticatedContext TOTAL: ${(performance.now() - perfTotalStart).toFixed(0)} ms (no separate org document read)`,
  );

  return {
    orgId: profile.organizationId,
    userId,
    role: requireUserRole(profile.role),
  };
}

/**
 * Resolves the caller from a verified Firebase session cookie only.
 * Never trust a client-supplied uid. Cached per request to avoid duplicate
 * Firestore reads when layout and page both authenticate.
 */
export const getAuthenticatedContext = cache(resolveAuthenticatedContext);

/**
 * Same as getAuthenticatedContext but returns a result instead of throwing
 * for onboarding/auth states that should redirect rather than crash SSR.
 */
export const tryGetAuthenticatedContext = cache(
  async (): Promise<AuthenticatedContextResult> => {
    try {
      const context = await getAuthenticatedContext();
      return { status: 'ok', context };
    } catch (error) {
      if (!(error instanceof DomainError)) {
        throw error;
      }

      if (error.code === 'UNAUTHORIZED') {
        return { status: 'unauthorized' };
      }

      if (error.code === 'USER_NOT_FOUND') {
        return { status: 'user_not_found' };
      }

      if (error.code === 'ORG_NOT_CONFIGURED') {
        const userId = await getVerifiedSessionUserId().catch(() => null);

        if (!userId) {
          return { status: 'unauthorized' };
        }

        return { status: 'org_not_configured', userId };
      }

      throw error;
    }
  },
);

/**
 * Verified session uid only — for onboarding before an organization exists.
 */
export async function getAuthenticatedUserId(): Promise<string> {
  try {
    return await getVerifiedSessionUserId();
  } catch {
    throw new DomainError('UNAUTHORIZED', 'Authentication required.');
  }
}
