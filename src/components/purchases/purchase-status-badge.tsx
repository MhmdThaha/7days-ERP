import { Badge } from '@/components/ui/badge';
import type { PurchaseStatus } from '@/types/purchase';

type PurchaseStatusBadgeProps = {
  status: PurchaseStatus;
};

const STATUS_CONFIG: Record<PurchaseStatus, { label: string; variant: 'neutral' | 'success' }> = {
  draft: {
    label: 'Draft',
    variant: 'neutral',
  },
  received: {
    label: 'Received',
    variant: 'success',
  },
};

export function PurchaseStatusBadge({ status }: PurchaseStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
