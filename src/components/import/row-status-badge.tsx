'use client';

import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { RowStatus } from '@/lib/import/engine/types';

const STATUS_CONFIG = {
  valid: { label: 'Ready', variant: 'success', Icon: CheckCircle2 },
  warning: { label: 'Warning', variant: 'warning', Icon: AlertTriangle },
  error: { label: 'Error', variant: 'destructive', Icon: XCircle },
} as const;

export function RowStatusBadge({ status }: { status: RowStatus }) {
  const { label, variant, Icon } = STATUS_CONFIG[status];

  return (
    <Badge variant={variant}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}
