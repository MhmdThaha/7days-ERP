import type { AuthError } from 'firebase/auth';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
};

export function isAuthError(error: unknown): error is AuthError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as AuthError).code === 'string'
  );
}

export function getAuthErrorMessage(error: unknown): string {
  if (isAuthError(error)) {
    return AUTH_ERROR_MESSAGES[error.code] ?? 'Authentication failed. Please try again.';
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Authentication failed. Please try again.';
}

export class AuthClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AuthClientError';
  }
}

export function toAuthClientError(error: unknown): AuthClientError {
  if (isAuthError(error)) {
    return new AuthClientError(getAuthErrorMessage(error), error.code);
  }

  if (error instanceof AuthClientError) {
    return error;
  }

  return new AuthClientError(getAuthErrorMessage(error), 'auth/unknown');
}
