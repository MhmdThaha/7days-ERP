import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { STOCK_STATUS_LABELS, type StockStatus } from '@/lib/domain/stock-status';

type StockStatusBadgeProps = {
  status: StockStatus;
  className?: string;
};

const statusStyles: Record<StockStatus, string> = {
  in_stock: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100/90',
  low_stock: 'bg-amber-100 text-amber-800 hover:bg-amber-100/90',
  out_of_stock: 'bg-rose-100 text-rose-800 hover:bg-rose-100/90',
};

export function StockStatusBadge({ status, className }: StockStatusBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={cn(statusStyles[status], className)}
      aria-label={STOCK_STATUS_LABELS[status]}
    >
      {STOCK_STATUS_LABELS[status]}
    </Badge>
  );
}
