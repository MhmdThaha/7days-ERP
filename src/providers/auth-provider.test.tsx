// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuthContext } from '@/providers/auth-provider';

const {
  mockDestroyServerSession,
  mockSignOutUser,
  mockOnIdTokenChanged,
} = vi.hoisted(() => ({
  mockDestroyServerSession: vi.fn(),
  mockSignOutUser: vi.fn(),
  mockOnIdTokenChanged: vi.fn(),
}));

vi.mock('@/lib/auth/session-client', () => ({
  createServerSession: vi.fn(),
  destroyServerSession: mockDestroyServerSession,
  syncServerSessionFromUser: vi.fn(),
}));

vi.mock('@/lib/auth/auth-client', () => ({
  signInWithEmailPassword: vi.fn(),
  signInWithGoogle: vi.fn(),
  signUpWithEmailPassword: vi.fn(),
  signOutUser: mockSignOutUser,
  sendPasswordReset: vi.fn(),
}));

vi.mock('@/lib/firebase/client', () => ({
  getClientAuth: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', () => ({
  onIdTokenChanged: mockOnIdTokenChanged,
}));

function AuthConsumer() {
  const { signOut } = useAuthContext();

  return (
    <button type="button" onClick={() => void signOut()}>
      Sign out
    </button>
  );
}

describe('AuthProvider session lifecycle', () => {
  beforeEach(() => {
    mockDestroyServerSession.mockReset();
    mockSignOutUser.mockReset();
    mockOnIdTokenChanged.mockReset();
    mockDestroyServerSession.mockResolvedValue(undefined);
    mockSignOutUser.mockResolvedValue(undefined);
    mockOnIdTokenChanged.mockImplementation((_auth, callback) => {
      callback(null);
      return vi.fn();
    });
  });

  it('clears React Query cache on logout', async () => {
    const queryClient = new QueryClient();
    const clearSpy = vi.spyOn(queryClient, 'clear');

    queryClient.setQueryData(['products'], [{ id: 'p1' }]);

    const { getByRole } = render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(getByRole('button', { name: 'Sign out' })).toBeTruthy();
    });

    getByRole('button', { name: 'Sign out' }).click();

    await waitFor(() => {
      expect(mockDestroyServerSession).toHaveBeenCalledTimes(1);
      expect(clearSpy).toHaveBeenCalledTimes(1);
      expect(mockSignOutUser).toHaveBeenCalledTimes(1);
    });
  });
});
