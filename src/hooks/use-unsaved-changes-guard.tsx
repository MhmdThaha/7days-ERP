'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { resolveInternalNavigationHrefFromTarget } from '@/lib/navigation/resolve-internal-navigation-href';

const UNSAVED_MESSAGE = 'You have unsaved changes. Leave this page?';

type UseUnsavedChangesGuardResult = {
  allowNavigation: () => void;
  unsavedChangesDialog: ReactNode;
};

export function useUnsavedChangesGuard(isDirty: boolean): UseUnsavedChangesGuardResult {
  const router = useRouter();
  const bypassRef = useRef(false);
  const pendingHrefRef = useRef<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const allowNavigation = useCallback(() => {
    bypassRef.current = true;
  }, []);

  useEffect(() => {
    if (!isDirty) {
      bypassRef.current = false;
    }
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty || bypassRef.current) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (bypassRef.current || event.defaultPrevented) {
        return;
      }

      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const href = resolveInternalNavigationHrefFromTarget(target);

      if (!href) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      pendingHrefRef.current = href;
      setDialogOpen(true);
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [isDirty]);

  function handleStay() {
    pendingHrefRef.current = null;
    setDialogOpen(false);
  }

  function handleLeave() {
    const href = pendingHrefRef.current;
    pendingHrefRef.current = null;
    setDialogOpen(false);
    bypassRef.current = true;

    if (href) {
      router.push(href);
    }
  }

  const unsavedChangesDialog = (
    <ConfirmDialog
      open={dialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleStay();
        }
      }}
      title="Unsaved changes"
      description={UNSAVED_MESSAGE}
      cancelLabel="Stay"
      confirmLabel="Leave"
      confirmVariant="destructive"
      onConfirm={handleLeave}
    />
  );

  return { allowNavigation, unsavedChangesDialog };
}
