import { Badge } from '@/components/ui/badge';

type StatusBadgeProps = {
  isActive: boolean;
};

export function StatusBadge({ isActive }: StatusBadgeProps) {
  return (
    <Badge variant={isActive ? 'success' : 'neutral'} aria-label={isActive ? 'Active' : 'Inactive'}>
      {isActive ? 'Active' : 'Inactive'}
    </Badge>
  );
}
