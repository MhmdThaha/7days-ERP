import { beforeEach, describe, expect, it } from 'vitest';

import { DomainError } from '@/lib/domain/errors';
import {
  createTestProfile,
  grantValidSession,
  mockUserRepositoryGetById,
  mockVerifySessionCookie,
  resetAuthMocks,
  setSessionCookie,
} from '@/test/security/auth-mocks';

import { getAuthenticatedContext, getAuthenticatedUserId } from '@/lib/firebase/auth-server';

describe('getAuthenticatedContext', () => {
  beforeEach(() => {
    resetAuthMocks();
  });

  it('throws UNAUTHORIZED when session cookie is missing', async () => {
    setSessionCookie(undefined);

    await expect(getAuthenticatedContext()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('throws UNAUTHORIZED when session cookie is invalid', async () => {
    setSessionCookie('invalid-session');
    mockVerifySessionCookie.mockRejectedValue(new Error('invalid session'));

    await expect(getAuthenticatedContext()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('throws UNAUTHORIZED when session cookie is expired', async () => {
    setSessionCookie('expired-session');
    mockVerifySessionCookie.mockRejectedValue(new Error('session cookie expired'));

    await expect(getAuthenticatedContext()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('throws UNAUTHORIZED when refresh tokens are revoked', async () => {
    setSessionCookie('revoked-session');
    mockVerifySessionCookie.mockRejectedValue(new Error('Firebase session cookie has been revoked'));

    await expect(getAuthenticatedContext()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('returns org context for a valid session', async () => {
    grantValidSession({ userId: 'user-a', orgId: 'org-a', role: 'owner' });

    await expect(getAuthenticatedContext()).resolves.toEqual({
      orgId: 'org-a',
      userId: 'user-a',
      role: 'owner',
    });
  });

  it('throws USER_NOT_FOUND when profile is missing', async () => {
    setSessionCookie('valid-session');
    mockVerifySessionCookie.mockResolvedValue({ uid: 'user-a', sub: 'user-a' });
    mockUserRepositoryGetById.mockResolvedValue(null);

    await expect(getAuthenticatedContext()).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });
  });

  it('throws ORG_NOT_CONFIGURED when organizationId is missing', async () => {
    setSessionCookie('valid-session');
    mockVerifySessionCookie.mockResolvedValue({ uid: 'user-a', sub: 'user-a' });
    mockUserRepositoryGetById.mockResolvedValue(
      createTestProfile({ id: 'user-a', organizationId: '', role: 'owner' }),
    );

    await expect(getAuthenticatedContext()).rejects.toMatchObject({
      code: 'ORG_NOT_CONFIGURED',
    });
  });

  it('throws INVALID_ROLE when role is missing', async () => {
    grantValidSession({ userId: 'user-a', orgId: 'org-a', role: null });

    await expect(getAuthenticatedContext()).rejects.toMatchObject({
      code: 'INVALID_ROLE',
    });
  });

  it('throws INVALID_ROLE when role is invalid', async () => {
    setSessionCookie('valid-session');
    mockVerifySessionCookie.mockResolvedValue({ uid: 'user-a', sub: 'user-a' });
    mockUserRepositoryGetById.mockResolvedValue(
      createTestProfile({ id: 'user-a', organizationId: 'org-a', role: null }),
    );

    await expect(getAuthenticatedContext()).rejects.toMatchObject({
      code: 'INVALID_ROLE',
    });
  });

  it('derives orgId from the authenticated user profile, not client input', async () => {
    grantValidSession({ userId: 'user-a', orgId: 'org-a', role: 'manager' });

    const context = await getAuthenticatedContext();

    expect(context.orgId).toBe('org-a');
    expect(mockUserRepositoryGetById).toHaveBeenCalledWith('user-a');
  });
});

describe('getAuthenticatedUserId', () => {
  beforeEach(() => {
    resetAuthMocks();
  });

  it('throws UNAUTHORIZED without a session cookie', async () => {
    setSessionCookie(undefined);

    await expect(getAuthenticatedUserId()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('returns uid from a verified session cookie', async () => {
    setSessionCookie('valid-session');
    mockVerifySessionCookie.mockResolvedValue({ uid: 'user-a', sub: 'user-a' });

    await expect(getAuthenticatedUserId()).resolves.toBe('user-a');
  });
});

describe('organization isolation via authenticated context', () => {
  beforeEach(() => {
    resetAuthMocks();
  });

  it('User A resolves to Organization A only', async () => {
    grantValidSession({ userId: 'user-a', orgId: 'org-a', role: 'owner', sessionValue: 'session-a' });

    const context = await getAuthenticatedContext();

    expect(context.userId).toBe('user-a');
    expect(context.orgId).toBe('org-a');
    expect(context.orgId).not.toBe('org-b');
  });

  it('User B resolves to Organization B only', async () => {
    grantValidSession({ userId: 'user-b', orgId: 'org-b', role: 'owner', sessionValue: 'session-b' });

    const context = await getAuthenticatedContext();

    expect(context.userId).toBe('user-b');
    expect(context.orgId).toBe('org-b');
    expect(context.orgId).not.toBe('org-a');
  });
});

describe('role defaulting regression', () => {
  beforeEach(() => {
    resetAuthMocks();
  });

  it('never grants owner role when Firestore role is missing', async () => {
    grantValidSession({ userId: 'user-a', orgId: 'org-a', role: null });

    await expect(getAuthenticatedContext()).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('INVALID_ROLE');
      return true;
    });
  });

  it('never grants owner role when Firestore role is invalid', async () => {
    setSessionCookie('valid-session');
    mockVerifySessionCookie.mockResolvedValue({ uid: 'user-a', sub: 'user-a' });
    mockUserRepositoryGetById.mockResolvedValue({
      id: 'user-a',
      email: 'a@example.com',
      displayName: 'A',
      photoUrl: null,
      organizationId: 'org-a',
      role: null,
    });

    await expect(getAuthenticatedContext()).rejects.toMatchObject({
      code: 'INVALID_ROLE',
    });
  });
});
