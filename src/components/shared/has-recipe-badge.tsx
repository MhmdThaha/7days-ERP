import { Badge } from '@/components/ui/badge';

type HasRecipeBadgeProps = {
  hasRecipe: boolean;
};

export function HasRecipeBadge({ hasRecipe }: HasRecipeBadgeProps) {
  if (!hasRecipe) {
    return null;
  }

  return <Badge variant="info">Has Recipe</Badge>;
}
