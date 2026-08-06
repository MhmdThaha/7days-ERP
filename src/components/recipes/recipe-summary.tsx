'use client';

import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMassKg } from '@/lib/domain/units/mass-conversion';
import { cn } from '@/lib/utils';

type RecipeSummaryProps = {
  ingredientCount: number;
  totalWeight: number;
  batchOutputQuantity?: number | null;
  variant?: 'default' | 'compact' | 'sticky';
};

type LiveMetricProps = {
  label: string;
  value: string | number;
  size?: 'default' | 'compact';
  emphasize?: boolean;
};

function LiveMetric({ label, value, size = 'default', emphasize = false }: LiveMetricProps) {
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
          emphasize && 'text-lg',
          highlight && 'text-primary',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function formatMakes(value: number | null | undefined): string {
  if (value == null || value <= 0) {
    return 'Not set';
  }

  return value.toLocaleString('en-IN');
}

export function RecipeSummary({
  ingredientCount,
  totalWeight,
  batchOutputQuantity,
  variant = 'default',
}: RecipeSummaryProps) {
  const formattedWeight = formatMassKg(totalWeight);
  const makesLabel = formatMakes(batchOutputQuantity);

  if (variant === 'compact') {
    return (
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="Recipe summary">
        <LiveMetric label="Makes" value={makesLabel} size="compact" emphasize />
        <LiveMetric label="Ingredients" value={ingredientCount} size="compact" emphasize />
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
          <CardDescription>Batch size and ingredients update as you edit.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <LiveMetric label="Batch Size (Makes)" value={makesLabel} emphasize />
          <LiveMetric label="Ingredient Count" value={ingredientCount} emphasize />
          <LiveMetric label="Yield" value={makesLabel === 'Not set' ? makesLabel : `${makesLabel} per batch`} />
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
        <LiveMetric label="Batch Size (Makes)" value={makesLabel} emphasize />
        <LiveMetric label="Ingredient Count" value={ingredientCount} emphasize />
        <LiveMetric label="Yield" value={makesLabel === 'Not set' ? makesLabel : `${makesLabel} per batch`} />
        <LiveMetric label="Total Ingredient Weight" value={formattedWeight} />
      </CardContent>
    </Card>
  );
}
