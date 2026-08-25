'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import { recordTransactionalWorkflowUrl } from '@/lib/navigation/module-workflow-resume';

/** Records the current transactional workflow URL in sessionStorage. */
export function useRecordWorkflowResume(): void {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const search = searchParams.toString();
    const query = search ? `?${search}` : '';
    recordTransactionalWorkflowUrl(pathname, query);
  }, [pathname, searchParams]);
}
