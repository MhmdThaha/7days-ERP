import 'server-only';

import type { AuthTraceEvent, AuthTraceStatus } from '@/lib/observability/auth-trace.types';
import { getServerDeploymentMeta } from '@/lib/observability/deployment-meta';

type AuthLogServerInput = {
  step: string;
  status: AuthTraceStatus;
  durationMs?: number;
  errorCode?: string;
  traceId?: string | null;
  meta?: Record<string, string | number | boolean | null>;
};

function buildServerAuthTraceEvent(input: AuthLogServerInput): AuthTraceEvent {
  const { deployment, environment } = getServerDeploymentMeta();

  return {
    traceId: input.traceId ?? null,
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

export function authLogServer(input: AuthLogServerInput): void {
  try {
    const event = buildServerAuthTraceEvent(input);
    console.log(JSON.stringify(event));
  } catch {
    // Logging must never affect authentication.
  }
}
