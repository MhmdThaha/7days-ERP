/**
 * [PERF-GLOBAL-TEMP] Temporary global performance instrumentation.
 * Remove entire file after investigation completes.
 */

export function perfNow(): number {
  return performance.now();
}

export function perfLog(scope: string, label: string, startMs: number, extra?: string): number {
  const elapsed = performance.now() - startMs;
  const suffix = extra ? ` | ${extra}` : '';
  console.log(`[PERF-GLOBAL][${scope}] ${label}: ${elapsed.toFixed(0)} ms${suffix}`);
  return elapsed;
}

export function perfLogAbsolute(scope: string, label: string, ms: number, extra?: string): void {
  const suffix = extra ? ` | ${extra}` : '';
  console.log(`[PERF-GLOBAL][${scope}] ${label}: ${ms.toFixed(0)} ms${suffix}`);
}
