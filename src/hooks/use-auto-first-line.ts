'use client';

import { useEffect, useRef } from 'react';

import { debugLog } from '@/lib/debug/sprint-debug';

export function useAutoFirstLine(
  isEditMode: boolean,
  fieldsLength: number,
  isReady: boolean,
  appendLine: () => void,
): void {
  const hasAppendedRef = useRef(false);

  useEffect(() => {
    debugLog('useAutoFirstLine', 'effect fired', {
      isEditMode,
      fieldsLength,
      isReady,
      hasAppendedAlready: hasAppendedRef.current,
    });

    if (isEditMode) {
      debugLog('useAutoFirstLine', 'SKIP (edit mode)', {});
      return;
    }

    if (!isReady || fieldsLength > 0 || hasAppendedRef.current) {
      debugLog('useAutoFirstLine', 'SKIP', {
        reason: !isReady
          ? 'not ready'
          : fieldsLength > 0
            ? 'fields already present'
            : 'already appended once (ref latched)',
        isReady,
        fieldsLength,
        hasAppendedAlready: hasAppendedRef.current,
      });
      return;
    }

    hasAppendedRef.current = true;
    debugLog('useAutoFirstLine', 'APPEND first line', { fieldsLength });
    appendLine();
  }, [appendLine, fieldsLength, isEditMode, isReady]);
}
