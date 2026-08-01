import { NextResponse, type NextRequest } from 'next/server';

import {
  CREATE_BAKERY_PATH,
  DEFAULT_LOGIN_PATH,
  PROTECTED_ROUTE_PREFIXES,
  SESSION_COOKIE_NAME,
} from '@/lib/auth/constants';
import { authLogEdge } from '@/lib/observability/auth-logger.edge';
import { AUTH_TRACE_STEPS } from '@/lib/observability/auth-trace.types';

function isProtectedRoute(pathname: string): boolean {
  if (pathname === CREATE_BAKERY_PATH) {
    return true;
  }

  return PROTECTED_ROUTE_PREFIXES.some((prefix) => {
    if (prefix === '/') {
      return pathname === '/';
    }

    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

export function middleware(request: NextRequest) {
  // [PERF-GLOBAL-TEMP] instrumentation — remove after investigation
  const perfStart = performance.now();

  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (isProtectedRoute(pathname) && !hasSession) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = DEFAULT_LOGIN_PATH;
    loginUrl.searchParams.set('next', pathname);
    const response = NextResponse.redirect(loginUrl);
    authLogEdge({
      step: AUTH_TRACE_STEPS.MIDDLEWARE_DECISION,
      status: 'success',
      meta: { path: pathname, hasSessionCookie: hasSession, decision: 'redirect' },
    });
    response.headers.set('x-perf-middleware-ms', (performance.now() - perfStart).toFixed(0));
    return response;
  }

  // Do not redirect auth routes based on cookie presence alone. A stale or invalid
  // session cookie would otherwise bounce /login -> / -> /login indefinitely
  // because dashboard SSR validates the cookie and sends unauthenticated users back.

  const response = NextResponse.next();
  // [PERF-GLOBAL-TEMP]
  authLogEdge({
    step: AUTH_TRACE_STEPS.MIDDLEWARE_DECISION,
    status: 'success',
    meta: { path: pathname, hasSessionCookie: hasSession, decision: 'pass' },
  });
  response.headers.set('x-perf-middleware-ms', (performance.now() - perfStart).toFixed(0));
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
