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

import { toAuthClientError } from './errors';
import { loginTrace, loginTraceError } from './login-trace';

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
  return runAuthOperation(async () => {
    loginTrace('2. Before signInWithEmailAndPassword()');
    try {
      const credential = await signInWithEmailAndPassword(
        getClientAuth(),
        input.email,
        input.password,
      );
      loginTrace('3. After signInWithEmailAndPassword()', {
        uid: credential.user.uid,
      });
      return credential;
    } catch (error: unknown) {
      loginTraceError('2-3. signInWithEmailAndPassword() threw', error);
      throw error;
    }
  });
}

export async function signInWithGoogle(): Promise<UserCredential> {
  return runAuthOperation(async () => {
    const provider = new GoogleAuthProvider();
    return signInWithPopup(getClientAuth(), provider);
  });
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
