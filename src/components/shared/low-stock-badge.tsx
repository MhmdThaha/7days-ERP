import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type LowStockBadgeProps = {
  className?: string;
};

export function LowStockBadge({ className }: LowStockBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={cn('bg-amber-100 text-amber-800 hover:bg-amber-100/90', className)}
      aria-label="Low stock"
    >
      Low Stock
    </Badge>
  );
}
