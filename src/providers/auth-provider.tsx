'use client';

import { onIdTokenChanged, type User } from 'firebase/auth';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  sendPasswordReset,
  signInWithEmailPassword,
  signInWithGoogle,
  signOutUser,
  signUpWithEmailPassword,
  type SignInInput,
  type SignUpInput,
} from '@/lib/auth/auth-client';
import { mapFirebaseUser } from '@/lib/auth/map-user';
import {
  checkServerSession,
  destroyServerSession,
  syncServerSessionFromUser,
} from '@/lib/auth/session-client';
import type { AuthUser } from '@/lib/auth/types';
import { getClientAuth } from '@/lib/firebase/client';
// TEMP-TRACE: remove after login-hang investigation
import { getActiveLoginTraceId } from '@/lib/observability/auth-trace-context';
import { usePathname } from 'next/navigation';

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (input: SignInInput) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  /** Re-mint the httpOnly session after the server rejects an authenticated request. */
  recoverServerSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function toAuthUser(user: User | null): AuthUser | null {
  if (!user) {
    return null;
  }

  return mapFirebaseUser(user);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastSyncedIdTokenRef = useRef<string | null>(null);
  /** While sign-in/up is minting the session, onIdTokenChanged must not race it. */
  const explicitSessionSyncRef = useRef(false);
  // TEMP-TRACE: remove after login-hang investigation
  const previousPathnameRef = useRef<string | null>(null);

  // TEMP-TRACE: remove after login-hang investigation — app-wide router transition observer
  useEffect(() => {
    const previous = previousPathnameRef.current;
    try {
      console.info('[TEMP-TRACE]', {
        TRACE_ID: getActiveLoginTraceId(),
        FUNCTION: 'AuthProvider',
        EVENT: previous === null ? 'router pathname initial' : 'router navigation completed',
        CURRENT_URL: typeof window !== 'undefined' ? window.location.href : null,
        NEXT_STEP: 'observe further navigations',
        previousPathname: previous,
        pathname,
        navigationStarted: previous !== null && previous !== pathname,
      });
    } catch {
      // observation only
    }
    previousPathnameRef.current = pathname;
  }, [pathname]);

  const rememberSyncedToken = useCallback((idToken: string) => {
    lastSyncedIdTokenRef.current = idToken;
  }, []);

  const applyAuthenticatedUser = useCallback(
    (firebaseUser: User, idToken: string) => {
      // TEMP-TRACE: remove after login-hang investigation
      try {
        console.info('[TEMP-TRACE]', {
          TRACE_ID: getActiveLoginTraceId(),
          FUNCTION: 'applyAuthenticatedUser',
          EVENT: 'ENTER',
          CURRENT_URL: typeof window !== 'undefined' ? window.location.href : null,
          NEXT_STEP: 'setUser(toAuthUser(firebaseUser))',
          uid: firebaseUser.uid,
          email: firebaseUser.email,
        });
      } catch {
        // observation only
      }

      rememberSyncedToken(idToken);
      setUser(toAuthUser(firebaseUser));

      // TEMP-TRACE: remove after login-hang investigation
      try {
        console.info('[TEMP-TRACE]', {
          TRACE_ID: getActiveLoginTraceId(),
          FUNCTION: 'applyAuthenticatedUser',
          EVENT: 'EXIT',
          CURRENT_URL: typeof window !== 'undefined' ? window.location.href : null,
          NEXT_STEP: 'runExplicitSessionSync resolves → signIn() finishes',
          uid: firebaseUser.uid,
          email: firebaseUser.email,
        });
      } catch {
        // observation only
      }
    },
    [rememberSyncedToken],
  );

  const runExplicitSessionSync = useCallback(
    async (firebaseUser: User) => {
      explicitSessionSyncRef.current = true;
      try {
        const idToken = await syncServerSessionFromUser(firebaseUser, { force: true });
        applyAuthenticatedUser(firebaseUser, idToken);
      } finally {
        explicitSessionSyncRef.current = false;
      }
    },
    [applyAuthenticatedUser],
  );

  const recoverServerSession = useCallback(async () => {
    const firebaseUser = getClientAuth().currentUser;

    if (!firebaseUser) {
      return;
    }

    await runExplicitSessionSync(firebaseUser);
  }, [runExplicitSessionSync]);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(getClientAuth(), async (firebaseUser) => {
      if (explicitSessionSyncRef.current) {
        return;
      }

      if (firebaseUser) {
        try {
          const idToken = await syncServerSessionFromUser(firebaseUser, {
            lastSyncedIdToken: lastSyncedIdTokenRef.current,
          });
          rememberSyncedToken(idToken);
        } catch {
          lastSyncedIdTokenRef.current = null;
          if (await checkServerSession()) {
            setUser(toAuthUser(firebaseUser));
            setIsLoading(false);
            return;
          }
          setUser(null);
          setIsLoading(false);
          return;
        }

        setUser(toAuthUser(firebaseUser));
      } else {
        lastSyncedIdTokenRef.current = null;
        setUser(null);
      }

      setIsLoading(false);
    });

    return unsubscribe;
  }, [rememberSyncedToken]);

  const signIn = useCallback(
    async (input: SignInInput) => {
      const credential = await signInWithEmailPassword(input);
      await runExplicitSessionSync(credential.user);
    },
    [runExplicitSessionSync],
  );

  const signInWithGoogleHandler = useCallback(async () => {
    const credential = await signInWithGoogle();
    await runExplicitSessionSync(credential.user);
  }, [runExplicitSessionSync]);

  const signUp = useCallback(
    async (input: SignUpInput) => {
      const credential = await signUpWithEmailPassword(input);
      await runExplicitSessionSync(credential.user);
    },
    [runExplicitSessionSync],
  );

  const signOut = useCallback(async () => {
    await destroyServerSession();
    lastSyncedIdTokenRef.current = null;
    queryClient.clear();
    await signOutUser();
  }, [queryClient]);

  const sendPasswordResetEmail = useCallback(async (email: string) => {
    await sendPasswordReset(email);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      signIn,
      signInWithGoogle: signInWithGoogleHandler,
      signUp,
      signOut,
      sendPasswordReset: sendPasswordResetEmail,
      recoverServerSession,
    }),
    [
      user,
      isLoading,
      signIn,
      signInWithGoogleHandler,
      signUp,
      signOut,
      sendPasswordResetEmail,
      recoverServerSession,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider.');
  }

  return context;
}
