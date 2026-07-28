/** Firebase session cookie lifetime — 5 days (Admin SDK max is 14 days). */
export const SESSION_COOKIE_MAX_AGE_MS = 60 * 60 * 24 * 5 * 1000;

export const SESSION_COOKIE_MAX_AGE_SECONDS = SESSION_COOKIE_MAX_AGE_MS / 1000;
