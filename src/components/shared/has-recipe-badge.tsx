import { Badge } from '@/components/ui/badge';

type HasRecipeBadgeProps = {
  hasRecipe: boolean;
};

export function HasRecipeBadge({ hasRecipe }: HasRecipeBadgeProps) {
  if (!hasRecipe) {
    return null;
  }

  return (
    <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
      Has Recipe
    </Badge>
  );
}
