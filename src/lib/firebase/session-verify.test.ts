import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockVerifySessionCookie = vi.fn();

vi.mock('@/lib/firebase/admin', () => ({
  getAdminAuth: vi.fn(() => ({
    verifySessionCookie: mockVerifySessionCookie,
  })),
}));

import {
  verifySessionCookieForRequest,
  verifySessionCookieStrict,
} from '@/lib/firebase/session-verify';

describe('session-verify', () => {
  beforeEach(() => {
    mockVerifySessionCookie.mockReset();
    mockVerifySessionCookie.mockResolvedValue({ uid: 'user-a', sub: 'user-a' });
  });

  it('verifySessionCookieForRequest skips revocation check', async () => {
    await verifySessionCookieForRequest('session-cookie');

    expect(mockVerifySessionCookie).toHaveBeenCalledWith('session-cookie', false);
  });

  it('verifySessionCookieStrict checks revocation', async () => {
    await verifySessionCookieStrict('session-cookie');

    expect(mockVerifySessionCookie).toHaveBeenCalledWith('session-cookie', true);
  });
});
