import 'server-only';

import { getAdminAuth } from '@/lib/firebase/admin';

/**
 * Hot-path session verification for SSR, server actions, and session probes.
 *
 * Validates cookie signature and expiry only (checkRevoked=false). This avoids
 * a Firebase round-trip to check refresh-token revocation on every request and
 * is the dominant cost in verifySessionCookie (~400–1000ms locally).
 *
 * Safe because logout revokes refresh tokens AND clears the cookie; invalid or
 * expired cookies still fail verification.
 */
export async function verifySessionCookieForRequest(
  sessionCookie: string,
): Promise<{ uid: string; sub: string }> {
  const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, false);
  return { uid: decoded.uid, sub: decoded.sub };
}

/**
 * Strict session verification for security-sensitive operations (logout).
 *
 * Uses checkRevoked=true so revoked refresh tokens invalidate the session
 * cookie immediately when tokens are revoked server-side.
 */
export async function verifySessionCookieStrict(
  sessionCookie: string,
): Promise<{ uid: string; sub: string }> {
  const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, true);
  return { uid: decoded.uid, sub: decoded.sub };
}
