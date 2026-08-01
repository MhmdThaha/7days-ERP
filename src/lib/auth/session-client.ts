'use client';

import type { User } from 'firebase/auth';

import { getActiveLoginTraceId } from '@/lib/observability/auth-trace-context';
import { LOGIN_TRACE_HEADER } from '@/lib/observability/auth-trace-header';
import { authLogClient } from '@/lib/observability/auth-logger.client';
import { AUTH_TRACE_STEPS } from '@/lib/observability/auth-trace.types';

const SESSION_API_PATH = '/api/auth/session';

function buildSessionRequestHeaders(
  extraHeaders?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = { ...extraHeaders };
  const traceId = getActiveLoginTraceId();

  if (traceId) {
    headers[LOGIN_TRACE_HEADER] = traceId;
  }

  return headers;
}

async function logSessionFetch(
  method: string,
  fetchPromise: Promise<Response>,
): Promise<Response> {
  const startedAt = performance.now();
  authLogClient({
    step: AUTH_TRACE_STEPS.SESSION_REQUEST_STARTED,
    status: 'started',
    meta: { method, path: SESSION_API_PATH },
  });

  const response = await fetchPromise;

  authLogClient({
    step: AUTH_TRACE_STEPS.SESSION_RESPONSE,
    status: response.ok ? 'success' : 'failure',
    durationMs: Math.round(performance.now() - startedAt),
    errorCode: response.ok ? undefined : String(response.status),
    meta: { method, path: SESSION_API_PATH, httpStatus: response.status },
  });

  return response;
}

export type SyncSessionOptions = {
  /** Always mint a new httpOnly session cookie (sign-in, sign-up, forced recovery). */
  force?: boolean;
  /** Last ID token written to the server session; avoids redundant POSTs when unchanged. */
  lastSyncedIdToken?: string | null;
};

export async function checkServerSession(): Promise<boolean> {
  const response = await logSessionFetch(
    'GET',
    fetch(SESSION_API_PATH, {
      method: 'GET',
      headers: buildSessionRequestHeaders(),
    }),
  );

  if (!response.ok) {
    return false;
  }

  const body = (await response.json()) as { authenticated?: boolean };
  return body.authenticated === true;
}

export async function createServerSession(idToken: string): Promise<void> {
  const response = await logSessionFetch(
    'POST',
    fetch(SESSION_API_PATH, {
      method: 'POST',
      headers: buildSessionRequestHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ idToken }),
    }),
  );

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
