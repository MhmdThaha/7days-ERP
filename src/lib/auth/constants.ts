/** Reserved for httpOnly session cookie — used when API session route is implemented. */
export const SESSION_COOKIE_NAME = 'session';

export const DEFAULT_LOGIN_PATH = '/login';
export const DEFAULT_AUTHENTICATED_PATH = '/';
export const CREATE_BAKERY_PATH = '/create-bakery';

export const AUTH_ROUTES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
] as const;

export type AuthRoute = (typeof AUTH_ROUTES)[number];

/**
 * Route prefixes that require authentication.
 * Middleware and client guards will use this list in a later phase.
 */
export const PROTECTED_ROUTE_PREFIXES = [
  '/',
  '/products',
  '/raw-materials',
  '/recipes',
  '/purchases',
  '/production',
  '/sales',
  '/returns',
  '/expenses',
  '/wastage',
  '/reports',
  '/inventory',
  '/daily-summary',
  '/monthly-summary',
  '/settings',
  '/onboarding',
] as const;
