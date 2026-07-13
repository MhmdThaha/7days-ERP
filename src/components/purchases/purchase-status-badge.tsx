import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PurchaseStatus } from '@/types/purchase';

type PurchaseStatusBadgeProps = {
  status: PurchaseStatus;
};

const STATUS_CONFIG: Record<
  PurchaseStatus,
  { label: string; className: string }
> = {
  draft: {
    label: 'Draft',
    className: 'bg-muted text-muted-foreground',
  },
  received: {
    label: 'Received',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
};

export function PurchaseStatusBadge({ status }: PurchaseStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <Badge variant="secondary" className={cn(config.className)}>
      {config.label}
    </Badge>
  );
}
