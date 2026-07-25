import { Badge } from '@/components/ui/badge';
import type { WastageStatus } from '@/types/wastage';

type WastageStatusBadgeProps = {
  status: WastageStatus;
};

const STATUS_CONFIG: Record<WastageStatus, { label: string; variant: 'neutral' | 'success' }> = {
  draft: {
    label: 'Draft',
    variant: 'neutral',
  },
  completed: {
    label: 'Completed',
    variant: 'success',
  },
};

export function WastageStatusBadge({ status }: WastageStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
