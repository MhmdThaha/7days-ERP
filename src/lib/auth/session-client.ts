'use client';

import type { User } from 'firebase/auth';

const SESSION_API_PATH = '/api/auth/session';

export type SyncSessionOptions = {
  /** Always mint a new httpOnly session cookie (sign-in, sign-up, forced recovery). */
  force?: boolean;
  /** Last ID token written to the server session; avoids redundant POSTs when unchanged. */
  lastSyncedIdToken?: string | null;
};

export async function checkServerSession(): Promise<boolean> {
  const response = await fetch(SESSION_API_PATH, { method: 'GET' });

  if (!response.ok) {
    return false;
  }

  const body = (await response.json()) as { authenticated?: boolean };
  return body.authenticated === true;
}

export async function createServerSession(idToken: string): Promise<void> {
  const response = await fetch(SESSION_API_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? 'Failed to create session.');
  }
}

export async function destroyServerSession(): Promise<void> {
  await fetch(SESSION_API_PATH, { method: 'DELETE' });
}

/**
 * Sync Firebase client auth to the httpOnly session cookie when needed.
 * Skips POST /api/auth/session when the existing cookie is still valid and the
 * ID token has not changed since the last successful sync.
 */
export async function syncServerSessionFromUser(
  user: User,
  options: SyncSessionOptions = {},
): Promise<string> {
  const idToken = await user.getIdToken();

  if (!options.force) {
    const sessionValid = await checkServerSession();
    const tokenChanged =
      options.lastSyncedIdToken != null && options.lastSyncedIdToken !== idToken;

    if (sessionValid && !tokenChanged) {
      return idToken;
    }
  }

  await createServerSession(idToken);
  return idToken;
}
