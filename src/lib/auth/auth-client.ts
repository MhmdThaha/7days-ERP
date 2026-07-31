import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type UserCredential,
} from 'firebase/auth';

import { getClientAuth } from '@/lib/firebase/client';

import { authLogClient } from '@/lib/observability/auth-logger.client';
import { AUTH_TRACE_STEPS } from '@/lib/observability/auth-trace.types';

import { AuthClientError, toAuthClientError } from './errors';

function getAuthErrorCode(error: unknown): string {
  if (error instanceof AuthClientError) {
    return error.code;
  }

  return 'auth/unknown';
}

export type SignUpInput = {
  email: string;
  password: string;
  displayName?: string;
};

export type SignInInput = {
  email: string;
  password: string;
};

async function runAuthOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    throw toAuthClientError(error);
  }
}

export async function signUpWithEmailPassword(input: SignUpInput): Promise<UserCredential> {
  return runAuthOperation(async () => {
    const credential = await createUserWithEmailAndPassword(
      getClientAuth(),
      input.email,
      input.password,
    );

    if (input.displayName) {
      await updateProfile(credential.user, { displayName: input.displayName });
      await credential.user.reload();
    }

    return credential;
  });
}

export async function signInWithEmailPassword(input: SignInInput): Promise<UserCredential> {
  authLogClient({ step: AUTH_TRACE_STEPS.EMAIL_STARTED, status: 'started' });

  try {
    const credential = await runAuthOperation(async () => {
      return signInWithEmailAndPassword(getClientAuth(), input.email, input.password);
    });
    authLogClient({ step: AUTH_TRACE_STEPS.EMAIL_SUCCESS, status: 'success' });
    return credential;
  } catch (error: unknown) {
    authLogClient({
      step: AUTH_TRACE_STEPS.EMAIL_FAILED,
      status: 'failure',
      errorCode: getAuthErrorCode(error),
    });
    throw error;
  }
}

export async function signInWithGoogle(): Promise<UserCredential> {
  authLogClient({ step: AUTH_TRACE_STEPS.GOOGLE_POPUP_STARTED, status: 'started' });

  try {
    const credential = await runAuthOperation(async () => {
      const provider = new GoogleAuthProvider();
      return signInWithPopup(getClientAuth(), provider);
    });
    authLogClient({ step: AUTH_TRACE_STEPS.GOOGLE_POPUP_SUCCESS, status: 'success' });
    return credential;
  } catch (error: unknown) {
    authLogClient({
      step: AUTH_TRACE_STEPS.GOOGLE_POPUP_FAILED,
      status: 'failure',
      errorCode: getAuthErrorCode(error),
    });
    throw error;
  }
}

export async function signOutUser(): Promise<void> {
  return runAuthOperation(async () => {
    await signOut(getClientAuth());
  });
}

export async function sendPasswordReset(email: string): Promise<void> {
  return runAuthOperation(async () => {
    await sendPasswordResetEmail(getClientAuth(), email);
  });
}
