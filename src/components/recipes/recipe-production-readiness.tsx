import { cn } from '@/lib/utils';

type RecipeProductionReadinessProps = {
  readyCount: number;
  needRecipeCount: number;
  inactiveCount: number;
  isLoading?: boolean;
};

type ReadinessMetricProps = {
  tone: 'success' | 'warning' | 'neutral';
  label: string;
  value: number;
};

const toneDotClass = {
  success: 'bg-success',
  warning: 'bg-warning',
  neutral: 'bg-muted-foreground/50',
} as const;

function ReadinessMetric({ tone, label, value }: ReadinessMetricProps) {
  return (
    <div className="flex min-w-[8.5rem] flex-1 items-center gap-3 rounded-lg border bg-card px-4 py-3">
      <span className={cn('size-2.5 shrink-0 rounded-full', toneDotClass[tone])} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums tracking-tight">{value.toLocaleString('en-IN')}</p>
      </div>
    </div>
  );
}

export function RecipeProductionReadiness({
  readyCount,
  needRecipeCount,
  inactiveCount,
  isLoading = false,
}: RecipeProductionReadinessProps) {
  if (isLoading) {
    return (
      <section aria-labelledby="recipe-production-readiness-heading" className="space-y-2">
        <h2
          id="recipe-production-readiness-heading"
          className="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Production Readiness
        </h2>
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-[4.25rem] min-w-[8.5rem] flex-1 animate-pulse rounded-lg border bg-muted/40" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="recipe-production-readiness-heading" className="space-y-2">
      <h2
        id="recipe-production-readiness-heading"
        className="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
      >
        Production Readiness
      </h2>
      <div className="flex flex-wrap gap-3">
        <ReadinessMetric tone="success" label="Ready" value={readyCount} />
        {needRecipeCount > 0 ? (
          <ReadinessMetric tone="warning" label="Need Recipe" value={needRecipeCount} />
        ) : null}
        {inactiveCount > 0 ? (
          <ReadinessMetric tone="neutral" label="Inactive" value={inactiveCount} />
        ) : null}
      </div>
    </section>
  );
}
