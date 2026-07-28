'use client';

import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMassKg } from '@/lib/domain/units/mass-conversion';
import { cn } from '@/lib/utils';

type RecipeSummaryProps = {
  ingredientCount: number;
  totalWeight: number;
  variant?: 'default' | 'compact' | 'sticky';
};

type LiveMetricProps = {
  label: string;
  value: string | number;
  size?: 'default' | 'compact';
};

function LiveMetric({ label, value, size = 'default' }: LiveMetricProps) {
  const [highlight, setHighlight] = useState(false);
  const previousValue = useRef(value);

  useEffect(() => {
    if (previousValue.current === value) {
      return;
    }

    previousValue.current = value;
    setHighlight(true);

    const timeoutId = window.setTimeout(() => {
      setHighlight(false);
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [value]);

  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p
        aria-live="polite"
        aria-atomic="true"
        className={cn(
          'font-semibold tabular-nums transition-colors duration-300',
          size === 'compact' ? 'text-base' : 'mt-1 text-2xl',
          highlight && 'text-primary',
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function RecipeSummary({
  ingredientCount,
  totalWeight,
  variant = 'default',
}: RecipeSummaryProps) {
  const formattedWeight = formatMassKg(totalWeight);

  if (variant === 'compact') {
    return (
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="Recipe summary">
        <LiveMetric label="Ingredients" value={ingredientCount} size="compact" />
        <LiveMetric label="Batch Weight" value={formattedWeight} size="compact" />
      </div>
    );
  }

  if (variant === 'sticky') {
    return (
      <Card className="border-primary/15 shadow-sm">
        <CardHeader className="space-y-2 pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Recipe Summary</CardTitle>
            <Badge variant="secondary" className="shrink-0 text-[10px] uppercase tracking-wide">
              Live
            </Badge>
          </div>
          <CardDescription>Updates automatically as you edit ingredients.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <LiveMetric label="Ingredient Count" value={ingredientCount} />
          <LiveMetric label="Total Ingredient Weight" value={formattedWeight} />
          <p className="text-xs text-muted-foreground">
            Weight includes kg, g, mg, l, and ml units only.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Recipe Summary</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <LiveMetric label="Ingredient Count" value={ingredientCount} />
        <LiveMetric label="Total Ingredient Weight" value={formattedWeight} />
      </CardContent>
    </Card>
  );
}
