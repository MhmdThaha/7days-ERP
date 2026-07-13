'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type RecipeSummaryProps = {
  ingredientCount: number;
  totalWeight: number;
};

function formatWeight(value: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

export function RecipeSummary({ ingredientCount, totalWeight }: RecipeSummaryProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Recipe Summary</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Ingredient Count</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{ingredientCount}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Total Ingredient Weight</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatWeight(totalWeight)}</p>
        </div>
      </CardContent>
    </Card>
  );
}
