'use client';

import { onIdTokenChanged, type User } from 'firebase/auth';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { loginTraceError, setLoginTraceSource } from '@/lib/auth/login-trace';
import { destroyServerSession, syncServerSessionFromUser } from '@/lib/auth/session-client';
import type { AuthUser } from '@/lib/auth/types';
import { getClientAuth } from '@/lib/firebase/client';

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (input: SignInInput) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
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
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(getClientAuth(), async (firebaseUser) => {
      if (firebaseUser) {
        setLoginTraceSource('onIdTokenChanged');
        try {
          await syncServerSessionFromUser(firebaseUser);
        } catch (error: unknown) {
          loginTraceError('onIdTokenChanged syncServerSessionFromUser threw', error);
          setUser(null);
          setIsLoading(false);
          return;
        }

        setUser(toAuthUser(firebaseUser));
      } else {
        setUser(null);
      }

      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = useCallback(async (input: SignInInput) => {
    setLoginTraceSource('signIn');
    try {
      const credential = await signInWithEmailPassword(input);
      await syncServerSessionFromUser(credential.user);
    } catch (error: unknown) {
      loginTraceError('signIn() threw', error);
      throw error;
    }
  }, []);

  const signInWithGoogleHandler = useCallback(async () => {
    const credential = await signInWithGoogle();
    await syncServerSessionFromUser(credential.user);
  }, []);

  const signUp = useCallback(async (input: SignUpInput) => {
    const credential = await signUpWithEmailPassword(input);
    await syncServerSessionFromUser(credential.user);
    setUser(toAuthUser(credential.user));
  }, []);

  const signOut = useCallback(async () => {
    await destroyServerSession();
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
    }),
    [user, isLoading, signIn, signInWithGoogleHandler, signUp, signOut, sendPasswordResetEmail],
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
