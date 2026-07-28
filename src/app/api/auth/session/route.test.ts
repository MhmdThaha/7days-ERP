import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { SESSION_COOKIE_MAX_AGE_MS, SESSION_COOKIE_MAX_AGE_SECONDS } from '@/lib/auth/session-config';
import {
  mockCreateSessionCookie,
  mockRevokeRefreshTokens,
  mockVerifyIdToken,
  mockVerifySessionCookie,
  resetAuthMocks,
  setSessionCookie,
} from '@/test/security/auth-mocks';

import { DELETE, POST } from '@/app/api/auth/session/route';

describe('POST /api/auth/session', () => {
  beforeEach(() => {
    resetAuthMocks();
  });

  it('creates an httpOnly session cookie for a valid ID token', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-a' });
    mockCreateSessionCookie.mockResolvedValue('session-cookie-value');

    const response = await POST(
      new Request('http://localhost/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'valid-id-token' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockVerifyIdToken).toHaveBeenCalledWith('valid-id-token');
    expect(mockCreateSessionCookie).toHaveBeenCalledWith('valid-id-token', {
      expiresIn: SESSION_COOKIE_MAX_AGE_MS,
    });

    const cookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie?.value).toBe('session-cookie-value');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('lax');
    expect(cookie?.maxAge).toBe(SESSION_COOKIE_MAX_AGE_SECONDS);
  });

  it('rejects missing ID tokens', async () => {
    const response = await POST(
      new Request('http://localhost/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  it('rejects invalid ID tokens', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('invalid token'));

    const response = await POST(
      new Request('http://localhost/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'bad-token' }),
      }),
    );

    expect(response.status).toBe(401);
    expect(mockCreateSessionCookie).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/auth/session', () => {
  beforeEach(() => {
    resetAuthMocks();
  });

  it('clears the session cookie on logout', async () => {
    setSessionCookie('existing-session');
    mockVerifySessionCookie.mockResolvedValue({ uid: 'user-a', sub: 'user-a' });
    mockRevokeRefreshTokens.mockResolvedValue(undefined);

    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(mockRevokeRefreshTokens).toHaveBeenCalledWith('user-a');

    const cookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie?.value).toBe('');
    expect(cookie?.maxAge).toBe(0);
  });

  it('still clears cookie when session verification fails', async () => {
    setSessionCookie('stale-session');
    mockVerifySessionCookie.mockRejectedValue(new Error('invalid session'));

    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(mockRevokeRefreshTokens).not.toHaveBeenCalled();

    const cookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie?.value).toBe('');
    expect(cookie?.maxAge).toBe(0);
  });
});

describe('session lifecycle', () => {
  beforeEach(() => {
    resetAuthMocks();
  });

  it('login then logout clears cookie state', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-a' });
    mockCreateSessionCookie.mockResolvedValue('session-cookie-value');

    const loginResponse = await POST(
      new Request('http://localhost/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'valid-id-token' }),
      }),
    );

    expect(loginResponse.cookies.get(SESSION_COOKIE_NAME)?.value).toBe('session-cookie-value');

    setSessionCookie('session-cookie-value');
    mockVerifySessionCookie.mockResolvedValue({ uid: 'user-a', sub: 'user-a' });

    const logoutResponse = await DELETE();

    expect(logoutResponse.cookies.get(SESSION_COOKIE_NAME)?.value).toBe('');
  });
});
