'use client';

import { Suspense } from 'react';

import { useRecordWorkflowResume } from '@/hooks/use-record-workflow-resume';

function WorkflowResumeRecorderInner() {
  useRecordWorkflowResume();
  return null;
}

/** Records transactional workflow URLs for sidebar resume navigation. */
export function WorkflowResumeRecorder() {
  return (
    <Suspense fallback={null}>
      <WorkflowResumeRecorderInner />
    </Suspense>
  );
}
