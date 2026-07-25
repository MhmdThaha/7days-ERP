import * as React from 'react';

/**
 * Returns false during SSR and the initial client hydration pass, then true
 * after the client has committed. Use this before rendering client-only UI
 * such as Base UI popups that assign DOM ids on mount.
 */
export function useHydrated() {
  return React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
