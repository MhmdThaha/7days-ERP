import {
  AUTH_ROUTES,
  DEFAULT_AUTHENTICATED_PATH,
  DEFAULT_LOGIN_PATH,
} from './constants';

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === '') {
    return '/';
  }

  const withoutTrailingSlash = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;

  return withoutTrailingSlash;
}

export function isAuthRoute(pathname: string): boolean {
  const normalized = normalizePathname(pathname);

  return AUTH_ROUTES.some(
    (route) => normalized === route || normalized.startsWith(`${route}/`),
  );
}

export function isProtectedRoute(pathname: string): boolean {
  const normalized = normalizePathname(pathname);

  if (isAuthRoute(normalized)) {
    return false;
  }

  return true;
}

export type AuthRedirectDecision = {
  redirectTo: string;
  reason: 'authenticated_on_auth_route' | 'unauthenticated_on_protected_route';
};

/**
 * Determines whether the current path should redirect based on auth state.
 * Returns null when no redirect is required.
 *
 * Used by client route guards now; middleware will use the same helpers later.
 */
export function getAuthRedirect(
  pathname: string,
  isAuthenticated: boolean,
): AuthRedirectDecision | null {
  const normalized = normalizePathname(pathname);

  if (isAuthenticated && isAuthRoute(normalized)) {
    return {
      redirectTo: DEFAULT_AUTHENTICATED_PATH,
      reason: 'authenticated_on_auth_route',
    };
  }

  if (!isAuthenticated && isProtectedRoute(normalized)) {
    return {
      redirectTo: DEFAULT_LOGIN_PATH,
      reason: 'unauthenticated_on_protected_route',
    };
  }

  return null;
}
