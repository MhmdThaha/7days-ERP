import { Badge } from '@/components/ui/badge';
import type { SaleStatus } from '@/types/sale';

type SaleStatusBadgeProps = {
  status: SaleStatus;
};

const STATUS_CONFIG: Record<SaleStatus, { label: string; variant: 'neutral' | 'success' }> = {
  draft: {
    label: 'Draft',
    variant: 'neutral',
  },
  completed: {
    label: 'Completed',
    variant: 'success',
  },
};

export function SaleStatusBadge({ status }: SaleStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
