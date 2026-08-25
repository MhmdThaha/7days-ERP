'use client';

import { useSyncExternalStore } from 'react';

import {
  MODULE_WORKFLOW_RESUME_CHANGED_EVENT,
  resolveTransactionalSidebarHref,
} from '@/lib/navigation/module-workflow-resume';

function subscribe(onStoreChange: () => void): () => void {
  const handler = () => onStoreChange();
  window.addEventListener(MODULE_WORKFLOW_RESUME_CHANGED_EVENT, handler);
  window.addEventListener('storage', handler);

  return () => {
    window.removeEventListener(MODULE_WORKFLOW_RESUME_CHANGED_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

function getServerSnapshot(defaultListHref: string): string {
  return defaultListHref;
}

/** Resolves sidebar href with per-module workflow resume from sessionStorage. */
export function useTransactionalSidebarHref(navModule: string, defaultListHref: string): string {
  return useSyncExternalStore(
    subscribe,
    () => resolveTransactionalSidebarHref(navModule, defaultListHref),
    () => getServerSnapshot(defaultListHref),
  );
}
