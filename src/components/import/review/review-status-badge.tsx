'use client';

import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { ConflictEngineStatus } from '@/lib/import/services/conflict-engine.service';
import { CONFLICT_ENGINE_STATUS } from '@/lib/import/services/conflict-engine.service';

const STATUS_CONFIG = {
  [CONFLICT_ENGINE_STATUS.READY]: {
    label: 'Ready',
    variant: 'success' as const,
    Icon: CheckCircle2,
  },
  [CONFLICT_ENGINE_STATUS.WARNING]: {
    label: 'Warning',
    variant: 'warning' as const,
    Icon: AlertTriangle,
  },
  [CONFLICT_ENGINE_STATUS.ERROR]: {
    label: 'Error',
    variant: 'destructive' as const,
    Icon: XCircle,
  },
};

export function ReviewStatusBadge({ status }: { status: ConflictEngineStatus }) {
  const { label, variant, Icon } = STATUS_CONFIG[status];

  return (
    <Badge variant={variant}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}

export function reviewStatusSortKey(status: ConflictEngineStatus): number {
  switch (status) {
    case CONFLICT_ENGINE_STATUS.ERROR:
      return 0;
    case CONFLICT_ENGINE_STATUS.WARNING:
      return 1;
    default:
      return 2;
  }
}
