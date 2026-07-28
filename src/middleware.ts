import { NextResponse, type NextRequest } from 'next/server';

import {
  AUTH_ROUTES,
  CREATE_BAKERY_PATH,
  DEFAULT_LOGIN_PATH,
  PROTECTED_ROUTE_PREFIXES,
  SESSION_COOKIE_NAME,
} from '@/lib/auth/constants';

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

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
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (isProtectedRoute(pathname) && !hasSession) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = DEFAULT_LOGIN_PATH;
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthRoute(pathname) && hasSession) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/';
    homeUrl.search = '';
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
