import { Badge } from '@/components/ui/badge';
import type { ExpenseStatus } from '@/types/expense';

type ExpenseStatusBadgeProps = {
  status: ExpenseStatus;
};

const STATUS_CONFIG: Record<ExpenseStatus, { label: string; variant: 'neutral' | 'success' }> = {
  draft: {
    label: 'Draft',
    variant: 'neutral',
  },
  completed: {
    label: 'Completed',
    variant: 'success',
  },
};

export function ExpenseStatusBadge({ status }: ExpenseStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
