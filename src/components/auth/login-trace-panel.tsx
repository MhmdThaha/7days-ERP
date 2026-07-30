'use client';

import { useEffect, useState } from 'react';

import type { LoginTraceEntry } from '@/lib/auth/login-trace';

/**
 * TEMPORARY on-screen LOGIN_TRACE panel for Android (no remote debug needed).
 * Remove after investigation.
 */
export function LoginTracePanel() {
  const [entries, setEntries] = useState<LoginTraceEntry[]>([]);

  useEffect(() => {
    const w = window as Window & { __LOGIN_TRACE__?: LoginTraceEntry[] };
    setEntries(w.__LOGIN_TRACE__ ?? []);

    function onTrace(event: Event) {
      const detail = (event as CustomEvent<LoginTraceEntry>).detail;
      setEntries((prev) => [...prev, detail]);
    }

    window.addEventListener('login-trace', onTrace);
    return () => window.removeEventListener('login-trace', onTrace);
  }, []);

  if (entries.length === 0) {
    return (
      <div
        className="fixed right-2 bottom-2 z-50 max-w-[min(100vw-1rem,22rem)] rounded border border-amber-600 bg-amber-50 p-2 font-mono text-[10px] text-amber-950 shadow"
        data-login-trace-panel
      >
        [LOGIN_TRACE] waiting… (temporary)
      </div>
    );
  }

  const last = entries[entries.length - 1];

  if (!last) {
    return null;
  }

  return (
    <div
      className="fixed right-2 bottom-2 z-50 max-h-48 max-w-[min(100vw-1rem,22rem)] overflow-auto rounded border border-amber-600 bg-amber-50 p-2 font-mono text-[10px] text-amber-950 shadow"
      data-login-trace-panel
    >
      <div className="mb-1 font-bold">[LOGIN_TRACE] last: {last.step}</div>
      <ol className="space-y-0.5">
        {entries.map((entry, index) => (
          <li key={`${entry.t}-${index}`}>
            {index + 1}. {entry.step}
            {entry.source !== 'unknown' ? ` (${entry.source})` : ''}
            {entry.data?.message ? ` — ${String(entry.data.message)}` : ''}
          </li>
        ))}
      </ol>
    </div>
  );
}
