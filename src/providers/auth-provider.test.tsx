// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuthContext } from '@/providers/auth-provider';

const {
  mockDestroyServerSession,
  mockSignOutUser,
  mockOnIdTokenChanged,
  mockSyncServerSessionFromUser,
  mockSignInWithEmailPassword,
} = vi.hoisted(() => ({
  mockDestroyServerSession: vi.fn(),
  mockSignOutUser: vi.fn(),
  mockOnIdTokenChanged: vi.fn(),
  mockSyncServerSessionFromUser: vi.fn(),
  mockSignInWithEmailPassword: vi.fn(),
}));

vi.mock('@/lib/auth/session-client', () => ({
  checkServerSession: vi.fn(),
  createServerSession: vi.fn(),
  destroyServerSession: mockDestroyServerSession,
  syncServerSessionFromUser: mockSyncServerSessionFromUser,
}));

vi.mock('@/lib/auth/auth-client', () => ({
  signInWithEmailPassword: mockSignInWithEmailPassword,
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
  const { signOut, user, isAuthenticated } = useAuthContext();

  return (
    <>
      <span data-testid="auth-state">{isAuthenticated ? user?.uid ?? 'authenticated' : 'guest'}</span>
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </>
  );
}

function SignInConsumer() {
  const { signIn, user, isAuthenticated } = useAuthContext();

  return (
    <>
      <span data-testid="auth-state">{isAuthenticated ? user?.uid ?? 'authenticated' : 'guest'}</span>
      <button
        type="button"
        onClick={() => void signIn({ email: 'user@example.com', password: 'secret' })}
      >
        Sign in
      </button>
    </>
  );
}

describe('AuthProvider session lifecycle', () => {
  beforeEach(() => {
    mockDestroyServerSession.mockReset();
    mockSignOutUser.mockReset();
    mockOnIdTokenChanged.mockReset();
    mockSyncServerSessionFromUser.mockReset();
    mockSignInWithEmailPassword.mockReset();
    mockDestroyServerSession.mockResolvedValue(undefined);
    mockSignOutUser.mockResolvedValue(undefined);
    mockOnIdTokenChanged.mockImplementation((_auth, callback) => {
      callback(null);
      return vi.fn();
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('sets user before signIn resolves so BakeryGate does not redirect to login', async () => {
    const firebaseUser = {
      uid: 'user-login-1',
      email: 'user@example.com',
      displayName: 'User',
      emailVerified: true,
    };

    mockSignInWithEmailPassword.mockResolvedValue({ user: firebaseUser });

    let idTokenCallback: ((user: typeof firebaseUser | null) => void) | undefined;
    mockOnIdTokenChanged.mockImplementation((_auth, callback) => {
      idTokenCallback = callback;
      return vi.fn();
    });

    mockSyncServerSessionFromUser.mockImplementation(async () => {
      idTokenCallback?.(firebaseUser);
      await new Promise((resolve) => setTimeout(resolve, 20));
      return 'fresh-id-token';
    });

    const { getByRole, getByTestId } = render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <SignInConsumer />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('auth-state').textContent).toBe('guest');
    });

    getByRole('button', { name: 'Sign in' }).click();

    await waitFor(() => {
      expect(getByTestId('auth-state').textContent).toBe('user-login-1');
    });

    expect(mockSyncServerSessionFromUser).toHaveBeenCalledWith(firebaseUser, { force: true });
    expect(mockSyncServerSessionFromUser).toHaveBeenCalledTimes(1);
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
