export type AuthTraceStatus = 'started' | 'success' | 'failure' | 'skipped';

export type AuthTraceEvent = {
  traceId: string | null;
  timestamp: string;
  step: string;
  status: AuthTraceStatus;
  durationMs?: number;
  errorCode?: string;
  deployment: string;
  environment: string;
  meta?: Record<string, string | number | boolean | null>;
};

export const AUTH_TRACE_STEPS = {
  LOGIN_BUTTON_CLICKED: 'auth.login.button_clicked',
  GOOGLE_POPUP_STARTED: 'auth.google.popup_started',
  GOOGLE_POPUP_SUCCESS: 'auth.google.popup_success',
  GOOGLE_POPUP_FAILED: 'auth.google.popup_failed',
  EMAIL_STARTED: 'auth.email.started',
  EMAIL_SUCCESS: 'auth.email.success',
  EMAIL_FAILED: 'auth.email.failed',
  SESSION_REQUEST_STARTED: 'auth.session.request_started',
  SESSION_RESPONSE: 'auth.session.response',
  SESSION_API_REQUEST_RECEIVED: 'auth.session_api.request_received',
  SESSION_API_VERIFY_ID_TOKEN_STARTED: 'auth.session_api.verify_id_token.started',
  SESSION_API_VERIFY_ID_TOKEN_SUCCESS: 'auth.session_api.verify_id_token.success',
  SESSION_API_VERIFY_ID_TOKEN_FAILED: 'auth.session_api.verify_id_token.failed',
  SESSION_API_CREATE_SESSION_COOKIE_STARTED: 'auth.session_api.create_session_cookie.started',
  SESSION_API_CREATE_SESSION_COOKIE_SUCCESS: 'auth.session_api.create_session_cookie.success',
  SESSION_API_CREATE_SESSION_COOKIE_FAILED: 'auth.session_api.create_session_cookie.failed',
  SESSION_API_RESPONSE_SENT: 'auth.session_api.response_sent',
  MIDDLEWARE_DECISION: 'auth.middleware.decision',
  GATE_LOADING: 'auth.gate.loading',
  GATE_AUTHENTICATED: 'auth.gate.authenticated',
  GATE_REDIRECT: 'auth.gate.redirect',
  GATE_READY: 'auth.gate.ready',
} as const;
