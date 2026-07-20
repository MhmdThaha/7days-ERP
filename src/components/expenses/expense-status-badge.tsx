import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ExpenseStatus } from '@/types/expense';

type ExpenseStatusBadgeProps = {
  status: ExpenseStatus;
};

const STATUS_CONFIG: Record<ExpenseStatus, { label: string; className: string }> = {
  draft: {
    label: 'Draft',
    className: 'bg-muted text-muted-foreground',
  },
  completed: {
    label: 'Completed',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
};

export function ExpenseStatusBadge({ status }: ExpenseStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <Badge variant="secondary" className={cn(config.className)}>
      {config.label}
    </Badge>
  );
}
