'use client';

import type { User } from 'firebase/auth';

import { loginTrace, loginTraceError } from '@/lib/auth/login-trace';

const SESSION_API_PATH = '/api/auth/session';

export async function createServerSession(idToken: string): Promise<void> {
  loginTrace('6. Before POST /api/auth/session', {
    idTokenLength: idToken.length,
  });
  try {
    const response = await fetch(SESSION_API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });

    loginTrace('7. After POST /api/auth/session', {
      status: response.status,
      ok: response.ok,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? 'Failed to create session.');
    }
  } catch (error: unknown) {
    loginTraceError('6-7. POST /api/auth/session threw', error);
    throw error;
  }
}

export async function destroyServerSession(): Promise<void> {
  await fetch(SESSION_API_PATH, { method: 'DELETE' });
}

export async function syncServerSessionFromUser(user: User): Promise<void> {
  loginTrace('4. Before getIdToken()', { uid: user.uid });
  try {
    const idToken = await user.getIdToken();
    loginTrace('5. After getIdToken()', { idTokenLength: idToken.length });
    await createServerSession(idToken);
  } catch (error: unknown) {
    loginTraceError('4-7. syncServerSessionFromUser threw', error);
    throw error;
  }
}
