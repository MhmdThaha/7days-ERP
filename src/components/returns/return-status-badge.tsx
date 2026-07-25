import { Badge } from '@/components/ui/badge';
import type { ReturnStatus } from '@/types/return';

type ReturnStatusBadgeProps = {
  status: ReturnStatus;
};

const STATUS_CONFIG: Record<ReturnStatus, { label: string; variant: 'neutral' | 'success' }> = {
  draft: {
    label: 'Draft',
    variant: 'neutral',
  },
  completed: {
    label: 'Completed',
    variant: 'success',
  },
};

export function ReturnStatusBadge({ status }: ReturnStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
