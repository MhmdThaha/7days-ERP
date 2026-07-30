import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';

import {
  checkServerSession,
  createServerSession,
  syncServerSessionFromUser,
} from '@/lib/auth/session-client';

const mockUser = {
  getIdToken: vi.fn(),
} as unknown as User;

describe('session-client conditional sync', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.url;
        const method = init?.method ?? 'GET';

        if (url.endsWith('/api/auth/session') && method === 'GET') {
          return new Response(JSON.stringify({ authenticated: true }), { status: 200 });
        }

        if (url.endsWith('/api/auth/session') && method === 'POST') {
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }

        return new Response(null, { status: 404 });
      }),
    );
    vi.mocked(mockUser.getIdToken).mockResolvedValue('firebase-id-token');
  });

  it('checkServerSession returns true when GET reports authenticated', async () => {
    await expect(checkServerSession()).resolves.toBe(true);
  });

  it('checkServerSession returns false when GET returns 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ authenticated: false }), { status: 401 })),
    );

    await expect(checkServerSession()).resolves.toBe(false);
  });

  it('skips POST when session cookie is valid and token unchanged', async () => {
    const fetchMock = vi.mocked(fetch);

    await syncServerSessionFromUser(mockUser, {
      lastSyncedIdToken: 'firebase-id-token',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.method ?? 'GET').toBe('GET');
  });

  it('POSTs when Firebase ID token rotates while session cookie is still valid', async () => {
    vi.mocked(mockUser.getIdToken).mockResolvedValue('rotated-id-token');
    const fetchMock = vi.mocked(fetch);

    await syncServerSessionFromUser(mockUser, {
      lastSyncedIdToken: 'previous-id-token',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'GET')).toBe(true);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
  });

  it('POSTs when session cookie is missing or expired', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo, init?: RequestInit) => {
        const method = init?.method ?? 'GET';

        if (method === 'GET') {
          return new Response(JSON.stringify({ authenticated: false }), { status: 401 });
        }

        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }),
    );

    const fetchMock = vi.mocked(fetch);

    await syncServerSessionFromUser(mockUser);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'GET')).toBe(true);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
  });

  it('POSTs on ordinary refresh when last synced token is unknown but session is valid', async () => {
    const fetchMock = vi.mocked(fetch);

    const idToken = await syncServerSessionFromUser(mockUser, {
      lastSyncedIdToken: null,
    });

    expect(idToken).toBe('firebase-id-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.method ?? 'GET').toBe('GET');
  });

  it('POSTs when Firebase ID token changes and session is invalid', async () => {
    vi.mocked(mockUser.getIdToken).mockResolvedValue('rotated-id-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo, init?: RequestInit) => {
        const method = init?.method ?? 'GET';

        if (method === 'GET') {
          return new Response(JSON.stringify({ authenticated: false }), { status: 401 });
        }

        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }),
    );

    const fetchMock = vi.mocked(fetch);

    await syncServerSessionFromUser(mockUser, {
      lastSyncedIdToken: 'previous-id-token',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
  });

  it('always POSTs when force is true even if session is valid', async () => {
    const fetchMock = vi.mocked(fetch);

    await syncServerSessionFromUser(mockUser, { force: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('createServerSession throws when POST fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 })),
    );

    await expect(createServerSession('bad-token')).rejects.toThrow('Invalid token');
  });
});
