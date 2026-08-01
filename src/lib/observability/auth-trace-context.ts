import { createLoginTraceId } from '@/lib/observability/auth-trace-id';

let activeLoginTraceId: string | null = null;
let activeLoginMethod: 'email' | 'google' | null = null;

export function beginLoginTrace(method: 'email' | 'google'): string {
  activeLoginTraceId = createLoginTraceId();
  activeLoginMethod = method;
  return activeLoginTraceId;
}

export function getActiveLoginTraceId(): string | null {
  return activeLoginTraceId;
}

export function getActiveLoginMethod(): 'email' | 'google' | null {
  return activeLoginMethod;
}

export function clearLoginTrace(): void {
  activeLoginTraceId = null;
  activeLoginMethod = null;
}
