'use client';

import type { AuthTraceEvent, AuthTraceStatus } from '@/lib/observability/auth-trace.types';
import { getActiveLoginTraceId } from '@/lib/observability/auth-trace-context';
import { getClientDeploymentMeta } from '@/lib/observability/deployment-meta';

type AuthLogClientInput = {
  step: string;
  status: AuthTraceStatus;
  durationMs?: number;
  errorCode?: string;
  meta?: Record<string, string | number | boolean | null>;
  traceId?: string | null;
};

function buildClientAuthTraceEvent(input: AuthLogClientInput): AuthTraceEvent {
  const { deployment, environment } = getClientDeploymentMeta();

  return {
    traceId: input.traceId !== undefined ? input.traceId : getActiveLoginTraceId(),
    timestamp: new Date().toISOString(),
    step: input.step,
    status: input.status,
    durationMs: input.durationMs,
    errorCode: input.errorCode,
    deployment,
    environment,
    meta: input.meta,
  };
}

export function authLogClient(input: AuthLogClientInput): void {
  try {
    const event = buildClientAuthTraceEvent(input);
    console.log(JSON.stringify(event));
  } catch {
    // Logging must never affect authentication.
  }
}
