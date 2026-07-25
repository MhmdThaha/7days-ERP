import { Badge } from '@/components/ui/badge';
import { STOCK_STATUS_LABELS, type StockStatus } from '@/lib/domain/stock-status';

type StockStatusBadgeProps = {
  status: StockStatus;
  className?: string;
};

const statusVariants: Record<StockStatus, 'success' | 'warning' | 'danger'> = {
  in_stock: 'success',
  low_stock: 'warning',
  out_of_stock: 'danger',
};

export function StockStatusBadge({ status, className }: StockStatusBadgeProps) {
  return (
    <Badge variant={statusVariants[status]} className={className} aria-label={STOCK_STATUS_LABELS[status]}>
      {STOCK_STATUS_LABELS[status]}
    </Badge>
  );
}
