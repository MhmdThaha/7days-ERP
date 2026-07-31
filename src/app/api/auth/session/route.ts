import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { SESSION_COOKIE_MAX_AGE_MS, SESSION_COOKIE_MAX_AGE_SECONDS } from '@/lib/auth/session-config';
import { getAdminAuth } from '@/lib/firebase/admin';
import {
  verifySessionCookieForRequest,
  verifySessionCookieStrict,
} from '@/lib/firebase/session-verify';
import { getLoginTraceIdFromHeaders } from '@/lib/observability/auth-trace-header';
import { authLogServer } from '@/lib/observability/auth-logger.server';
import { AUTH_TRACE_STEPS } from '@/lib/observability/auth-trace.types';
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
    await verifySessionCookieForRequest(sessionCookie);
    return NextResponse.json({ authenticated: true });  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}

export async function POST(request: Request) {
  const requestStartedAt = performance.now();
  const traceId = getLoginTraceIdFromHeaders(request.headers);
  authLogServer({
    step: AUTH_TRACE_STEPS.SESSION_API_REQUEST_RECEIVED,
    status: 'started',
    traceId,
    meta: { method: 'POST' },
  });

  let body: CreateSessionBody;

  try {
    body = (await request.json()) as CreateSessionBody;
  } catch {
    authLogServer({
      step: AUTH_TRACE_STEPS.SESSION_API_RESPONSE_SENT,
      status: 'failure',
      traceId,
      durationMs: Math.round(performance.now() - requestStartedAt),
      errorCode: '400',
      meta: { method: 'POST', httpStatus: 400 },
    });
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const idToken = body.idToken?.trim();

  if (!idToken) {
    authLogServer({
      step: AUTH_TRACE_STEPS.SESSION_API_RESPONSE_SENT,
      status: 'failure',
      traceId,
      durationMs: Math.round(performance.now() - requestStartedAt),
      errorCode: '400',
      meta: { method: 'POST', httpStatus: 400 },
    });
    return NextResponse.json({ error: 'Missing ID token.' }, { status: 400 });
  }

  const verifyStartedAt = performance.now();
  authLogServer({
    step: AUTH_TRACE_STEPS.SESSION_API_VERIFY_ID_TOKEN_STARTED,
    status: 'started',
    traceId,
  });

  try {
    await getAdminAuth().verifyIdToken(idToken);
    authLogServer({
      step: AUTH_TRACE_STEPS.SESSION_API_VERIFY_ID_TOKEN_SUCCESS,
      status: 'success',
      traceId,
      durationMs: Math.round(performance.now() - verifyStartedAt),
    });
  } catch {
    authLogServer({
      step: AUTH_TRACE_STEPS.SESSION_API_VERIFY_ID_TOKEN_FAILED,
      status: 'failure',
      traceId,
      durationMs: Math.round(performance.now() - verifyStartedAt),
    });
    authLogServer({
      step: AUTH_TRACE_STEPS.SESSION_API_RESPONSE_SENT,
      status: 'failure',
      traceId,
      durationMs: Math.round(performance.now() - requestStartedAt),
      errorCode: '401',
      meta: { method: 'POST', httpStatus: 401 },
    });
    return NextResponse.json({ error: 'Invalid or expired ID token.' }, { status: 401 });
  }

  const createSessionStartedAt = performance.now();
  authLogServer({
    step: AUTH_TRACE_STEPS.SESSION_API_CREATE_SESSION_COOKIE_STARTED,
    status: 'started',
    traceId,
  });

  let sessionCookie: string;

  try {
    sessionCookie = await getAdminAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_COOKIE_MAX_AGE_MS,
    });
    authLogServer({
      step: AUTH_TRACE_STEPS.SESSION_API_CREATE_SESSION_COOKIE_SUCCESS,
      status: 'success',
      traceId,
      durationMs: Math.round(performance.now() - createSessionStartedAt),
    });
  } catch {
    authLogServer({
      step: AUTH_TRACE_STEPS.SESSION_API_CREATE_SESSION_COOKIE_FAILED,
      status: 'failure',
      traceId,
      durationMs: Math.round(performance.now() - createSessionStartedAt),
    });
    authLogServer({
      step: AUTH_TRACE_STEPS.SESSION_API_RESPONSE_SENT,
      status: 'failure',
      traceId,
      durationMs: Math.round(performance.now() - requestStartedAt),
      errorCode: '401',
      meta: { method: 'POST', httpStatus: 401 },
    });
    return NextResponse.json({ error: 'Invalid or expired ID token.' }, { status: 401 });
  }

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

  authLogServer({
    step: AUTH_TRACE_STEPS.SESSION_API_RESPONSE_SENT,
    status: 'success',
    traceId,
    durationMs: Math.round(performance.now() - requestStartedAt),
    meta: { method: 'POST', httpStatus: 200 },
  });

  return response;
}

export async function DELETE() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionCookie) {
    try {
      const decoded = await verifySessionCookieStrict(sessionCookie);
      await getAdminAuth().revokeRefreshTokens(decoded.sub);    } catch {
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
