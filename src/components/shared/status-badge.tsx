import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type StatusBadgeProps = {
  isActive: boolean;
};

export function StatusBadge({ isActive }: StatusBadgeProps) {
  return (
    <Badge
      variant={isActive ? 'default' : 'secondary'}
      className={cn(
        isActive && 'bg-emerald-600 text-white hover:bg-emerald-600/90',
        !isActive && 'bg-muted text-muted-foreground',
      )}
      aria-label={isActive ? 'Active' : 'Inactive'}
    >
      {isActive ? 'Active' : 'Inactive'}
    </Badge>
  );
}
