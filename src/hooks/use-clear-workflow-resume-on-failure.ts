'use client';

import { useEffect } from 'react';

import type { TransactionalModule } from '@/lib/navigation/module-workflow-navigation';
import { clearModuleWorkflowResume } from '@/lib/navigation/module-workflow-resume';

/** Clears a module workflow bookmark when the current workflow page cannot be used. */
export function useClearWorkflowResumeOnFailure(
  module: TransactionalModule,
  shouldClear: boolean,
): void {
  useEffect(() => {
    if (!shouldClear) {
      return;
    }

    clearModuleWorkflowResume(module);
  }, [module, shouldClear]);
}
