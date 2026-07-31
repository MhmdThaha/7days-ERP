import type { AuthTraceEvent, AuthTraceStatus } from '@/lib/observability/auth-trace.types';

type AuthLogEdgeInput = {
  step: string;
  status: AuthTraceStatus;
  durationMs?: number;
  errorCode?: string;
  traceId?: string | null;
  meta?: Record<string, string | number | boolean | null>;
};

function buildEdgeAuthTraceEvent(input: AuthLogEdgeInput): AuthTraceEvent {
  return {
    traceId: input.traceId ?? null,
    timestamp: new Date().toISOString(),
    step: input.step,
    status: input.status,
    durationMs: input.durationMs,
    errorCode: input.errorCode,
    deployment:
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.VERCEL_DEPLOYMENT_ID ??
      'unknown',
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
    meta: input.meta,
  };
}

export function authLogEdge(input: AuthLogEdgeInput): void {
  try {
    const event = buildEdgeAuthTraceEvent(input);
    console.log(JSON.stringify(event));
  } catch {
    // Logging must never affect authentication.
  }
}
