import { vi } from 'vitest';

import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import type { UserProfile, UserRole } from '@/types/user';

export const mockCookiesGet = vi.fn();

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: mockCookiesGet,
  })),
}));

export const mockVerifySessionCookie = vi.fn();
export const mockVerifyIdToken = vi.fn();
export const mockCreateSessionCookie = vi.fn();
export const mockRevokeRefreshTokens = vi.fn();

vi.mock('@/lib/firebase/admin', () => ({
  getAdminAuth: vi.fn(() => ({
    verifySessionCookie: mockVerifySessionCookie,
    verifyIdToken: mockVerifyIdToken,
    createSessionCookie: mockCreateSessionCookie,
    revokeRefreshTokens: mockRevokeRefreshTokens,
  })),
}));

export const mockUserRepositoryGetById = vi.fn();

vi.mock('@/lib/repositories/user.repository', () => ({
  userRepository: {
    getById: mockUserRepositoryGetById,
  },
}));

export function setSessionCookie(value: string | undefined): void {
  mockCookiesGet.mockImplementation((name: string) => {
    if (name === SESSION_COOKIE_NAME && value !== undefined) {
      return { value };
    }

    return undefined;
  });
}

export function createTestProfile(input: {
  id: string;
  organizationId: string;
  role: UserRole | null;
  email?: string;
}): UserProfile {
  return {
    id: input.id,
    email: input.email ?? `${input.id}@example.com`,
    displayName: 'Test User',
    photoUrl: null,
    organizationId: input.organizationId,
    role: input.role,
  };
}

export function grantValidSession(input: {
  userId: string;
  orgId: string;
  role: UserRole | null;
  sessionValue?: string;
}): void {
  setSessionCookie(input.sessionValue ?? `session-${input.userId}`);
  mockVerifySessionCookie.mockResolvedValue({ uid: input.userId, sub: input.userId });
  mockUserRepositoryGetById.mockResolvedValue(
    createTestProfile({
      id: input.userId,
      organizationId: input.orgId,
      role: input.role,
    }),
  );
}

export function resetAuthMocks(): void {
  mockCookiesGet.mockReset();
  mockVerifySessionCookie.mockReset();
  mockVerifyIdToken.mockReset();
  mockCreateSessionCookie.mockReset();
  mockRevokeRefreshTokens.mockReset();
  mockUserRepositoryGetById.mockReset();
}
