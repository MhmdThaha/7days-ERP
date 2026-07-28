/**
 * TEMPORARY instrumentation for Stability Sprint runtime debugging (S1.2 / S4).
 * Delete this file and every `sprint-debug` import once the investigation is closed.
 */

let sequence = 0;
let bannerPrinted = false;
const instanceCounters = new Map<string, number>();

const PREFIX = 'S1.2';

export function debugNavType(): string {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return 'server';
  }

  const entry = performance.getEntriesByType('navigation')[0] as
    | { type?: string }
    | undefined;

  return entry?.type ?? 'unknown';
}

function printBanner(): void {
  if (bannerPrinted) {
    return;
  }

  bannerPrinted = true;

  const side = typeof window === 'undefined' ? 'SERVER' : 'CLIENT';
  const navType = debugNavType();
  const caseLabel =
    navType === 'reload' ? 'CASE 2 (Ctrl+R / reload)' : navType === 'navigate' ? 'CASE 1 (fresh document load)' : navType;

  console.log(
    `[${PREFIX}] ===== SESSION START (${side}) navigationType=${navType} → ${caseLabel} =====`,
  );
}

export function debugLog(scope: string, event: string, data?: Record<string, unknown>): void {
  printBanner();

  sequence += 1;

  const elapsed =
    typeof performance === 'undefined' ? 0 : Math.round(performance.now());

  console.log(
    `[${PREFIX} #${String(sequence).padStart(3, '0')} t=${elapsed}ms] ${scope} :: ${event}`,
    data ?? {},
  );
}

/** Stable per-mount identifier so mount/unmount pairs can be matched in logs. */
export function nextDebugInstanceId(scope: string): number {
  const next = (instanceCounters.get(scope) ?? 0) + 1;
  instanceCounters.set(scope, next);

  return next;
}
