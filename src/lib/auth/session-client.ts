'use client';

import type { User } from 'firebase/auth';

const SESSION_API_PATH = '/api/auth/session';

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

export async function syncServerSessionFromUser(user: User): Promise<void> {
  const idToken = await user.getIdToken();
  await createServerSession(idToken);
}
