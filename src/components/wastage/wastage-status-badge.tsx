import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { WastageStatus } from '@/types/wastage';

type WastageStatusBadgeProps = {
  status: WastageStatus;
};

const STATUS_CONFIG: Record<WastageStatus, { label: string; className: string }> = {
  draft: {
    label: 'Draft',
    className: 'bg-muted text-muted-foreground',
  },
  completed: {
    label: 'Completed',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
};

export function WastageStatusBadge({ status }: WastageStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <Badge variant="secondary" className={cn(config.className)}>
      {config.label}
    </Badge>
  );
}
