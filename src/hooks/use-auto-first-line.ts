'use client';

import { useEffect, useRef } from 'react';

export function useAutoFirstLine(
  isEditMode: boolean,
  fieldsLength: number,
  isReady: boolean,
  appendLine: () => void,
): void {
  const hasAppendedRef = useRef(false);

  useEffect(() => {
    if (isEditMode) {
      return;
    }

    if (!isReady || fieldsLength > 0 || hasAppendedRef.current) {
      return;
    }

    hasAppendedRef.current = true;
    appendLine();
  }, [appendLine, fieldsLength, isEditMode, isReady]);
}
