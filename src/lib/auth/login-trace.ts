/**
 * TEMPORARY mobile login diagnostics — remove after investigation.
 * Logs to console, window.__LOGIN_TRACE__, and POST /api/debug/login-trace.
 */

export type LoginTraceEntry = {
  t: number;
  step: string;
  source: string;
  data?: Record<string, unknown>;
};

let loginTraceSource = 'unknown';

export function setLoginTraceSource(source: string): void {
  loginTraceSource = source;
}

export function loginTrace(step: string, data?: Record<string, unknown>): void {
  const entry: LoginTraceEntry = {
    t: Date.now(),
    step,
    source: loginTraceSource,
    data,
  };

  console.log('[LOGIN_TRACE]', step, data ?? '', `{source:${loginTraceSource}}`);

  if (typeof window === 'undefined') {
    return;
  }

  const w = window as Window & { __LOGIN_TRACE__?: LoginTraceEntry[] };
  w.__LOGIN_TRACE__ = [...(w.__LOGIN_TRACE__ ?? []), entry];
  window.dispatchEvent(new CustomEvent('login-trace', { detail: entry }));

  void fetch('/api/debug/login-trace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
    keepalive: true,
  }).catch(() => undefined);
}

export function loginTraceError(step: string, error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  loginTrace(step, {
    message: err.message,
    name: err.name,
    stack: err.stack ?? '(no stack)',
  });
  console.error('[LOGIN_TRACE] EXCEPTION', step, err);
}
