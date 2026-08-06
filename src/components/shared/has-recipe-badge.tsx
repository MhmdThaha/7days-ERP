import { TriangleAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

type HasRecipeBadgeProps = {
  hasRecipe: boolean;
};

export function HasRecipeBadge({ hasRecipe }: HasRecipeBadgeProps) {
  if (hasRecipe) {
    return <Badge variant="info">Has Recipe</Badge>;
  }

  return (
    <Badge variant="warning">
      <TriangleAlert aria-hidden="true" />
      No Recipe
    </Badge>
  );
}
