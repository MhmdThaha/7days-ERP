'use client';

import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  sendPasswordReset,
  signInWithEmailPassword,
  signOutUser,
  signUpWithEmailPassword,
  type SignInInput,
  type SignUpInput,
} from '@/lib/auth/auth-client';
import { mapFirebaseUser } from '@/lib/auth/map-user';
import type { AuthUser } from '@/lib/auth/types';
import { getClientAuth } from '@/lib/firebase/client';

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (input: SignInInput) => Promise<void>;
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
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getClientAuth(), (firebaseUser) => {
      setUser(toAuthUser(firebaseUser));
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = useCallback(async (input: SignInInput) => {
    await signInWithEmailPassword(input);
  }, []);

  const signUp = useCallback(async (input: SignUpInput) => {
    await signUpWithEmailPassword(input);
  }, []);

  const signOut = useCallback(async () => {
    await signOutUser();
  }, []);

  const sendPasswordResetEmail = useCallback(async (email: string) => {
    await sendPasswordReset(email);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      signIn,
      signUp,
      signOut,
      sendPasswordReset: sendPasswordResetEmail,
    }),
    [user, isLoading, signIn, signUp, signOut, sendPasswordResetEmail],
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
