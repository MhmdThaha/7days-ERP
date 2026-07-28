export type { AuthUser, AuthState } from './types';
export { mapFirebaseUser } from './map-user';
export {
  AUTH_ROUTES,
  DEFAULT_AUTHENTICATED_PATH,
  DEFAULT_LOGIN_PATH,
  PROTECTED_ROUTE_PREFIXES,
  SESSION_COOKIE_NAME,
} from './constants';
export { getAuthRedirect, isAuthRoute, isProtectedRoute } from './routes';
export type { AuthRedirectDecision } from './routes';
export {
  AuthClientError,
  getAuthErrorMessage,
  isAuthError,
  toAuthClientError,
} from './errors';
export {
  sendPasswordReset,
  signInWithEmailPassword,
  signInWithGoogle,
  signOutUser,
  signUpWithEmailPassword,
} from './auth-client';
export type { SignInInput, SignUpInput } from './auth-client';
