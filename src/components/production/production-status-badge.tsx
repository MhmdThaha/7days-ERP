import { Badge } from '@/components/ui/badge';
import type { ProductionStatus } from '@/types/production';

type ProductionStatusBadgeProps = {
  status: ProductionStatus;
};

const STATUS_CONFIG: Record<ProductionStatus, { label: string; variant: 'warning' | 'success' }> =
  {
    draft: {
      label: 'Draft',
      variant: 'warning',
    },
    completed: {
      label: 'Completed',
      variant: 'success',
    },
  };

export function ProductionStatusBadge({ status }: ProductionStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <Badge variant={config.variant} className="h-6 px-2.5 text-xs font-semibold">
      {config.label}
    </Badge>
  );
}
