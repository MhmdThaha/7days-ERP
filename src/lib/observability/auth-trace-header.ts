export const LOGIN_TRACE_HEADER = 'X-Login-Trace-Id';

export function getLoginTraceIdFromHeaders(headers: Headers): string | null {
  const value = headers.get(LOGIN_TRACE_HEADER)?.trim();
  return value ? value : null;
}
