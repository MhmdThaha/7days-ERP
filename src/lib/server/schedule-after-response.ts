import 'server-only';

import { after } from 'next/server';

/**
 * Schedules work after the current Server Action / request response is sent.
 * Next.js keeps the runtime alive until the task finishes (`after` from `next/server`).
 *
 * Returns false when `after()` is unavailable (no request context, e.g. some unit tests)
 * so the caller can fall back to awaiting the work instead of fire-and-forget.
 */
export function scheduleAfterResponse(task: () => Promise<void>): boolean {
  try {
    after(task);
    return true;
  } catch (error) {
    console.error('[schedule-after-response] after() unavailable', error);
    return false;
  }
}
