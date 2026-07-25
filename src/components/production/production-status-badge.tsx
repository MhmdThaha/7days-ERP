import { Badge } from '@/components/ui/badge';
import type { ProductionStatus } from '@/types/production';

type ProductionStatusBadgeProps = {
  status: ProductionStatus;
};

const STATUS_CONFIG: Record<ProductionStatus, { label: string; variant: 'neutral' | 'success' }> =
  {
    draft: {
      label: 'Draft',
      variant: 'neutral',
    },
    completed: {
      label: 'Completed',
      variant: 'success',
    },
  };

export function ProductionStatusBadge({ status }: ProductionStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
