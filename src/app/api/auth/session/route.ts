import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { SESSION_COOKIE_MAX_AGE_MS, SESSION_COOKIE_MAX_AGE_SECONDS } from '@/lib/auth/session-config';
import { getAdminAuth } from '@/lib/firebase/admin';

type CreateSessionBody = {
  idToken?: string;
};

export async function GET() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  try {
    await getAdminAuth().verifySessionCookie(sessionCookie, true);
    return NextResponse.json({ authenticated: true });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}

export async function POST(request: Request) {
  // [PERF-GLOBAL-TEMP] instrumentation — remove after investigation
  const perfStart = performance.now();
  let perfLast = perfStart;

  let body: CreateSessionBody;

  try {
    body = (await request.json()) as CreateSessionBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const idToken = body.idToken?.trim();

  if (!idToken) {
    return NextResponse.json({ error: 'Missing ID token.' }, { status: 400 });
  }

  try {
    await getAdminAuth().verifyIdToken(idToken);
    console.log(
      `[PERF-GLOBAL][session] verifyIdToken: ${(performance.now() - perfLast).toFixed(0)} ms`,
    );
    perfLast = performance.now();

    const sessionCookie = await getAdminAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_COOKIE_MAX_AGE_MS,
    });
    console.log(
      `[PERF-GLOBAL][session] createSessionCookie: ${(performance.now() - perfLast).toFixed(0)} ms`,
    );
    perfLast = performance.now();

    const response = NextResponse.json({ success: true });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionCookie,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    });

    console.log(
      `[PERF-GLOBAL][session] POST /api/auth/session TOTAL: ${(performance.now() - perfStart).toFixed(0)} ms`,
    );
    return response;
  } catch {
    return NextResponse.json({ error: 'Invalid or expired ID token.' }, { status: 401 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionCookie) {
    try {
      const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, true);
      await getAdminAuth().revokeRefreshTokens(decoded.sub);
    } catch {
      // Cookie may already be invalid — still clear it.
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
