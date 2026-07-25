import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type LowStockBadgeProps = {
  className?: string;
};

export function LowStockBadge({ className }: LowStockBadgeProps) {
  return (
    <Badge variant="warning" className={cn(className)} aria-label="Low stock">
      Low Stock
    </Badge>
  );
}
