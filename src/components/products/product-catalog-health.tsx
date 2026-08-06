import { cn } from '@/lib/utils';

type ProductCatalogHealthProps = {
  activeCount: number;
  missingRecipeCount: number;
  inactiveCount: number;
  isLoading?: boolean;
};

type HealthMetricProps = {
  tone: 'success' | 'warning' | 'danger';
  label: string;
  value: number;
};

const toneDotClass = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
} as const;

function HealthMetric({ tone, label, value }: HealthMetricProps) {
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

export function ProductCatalogHealth({
  activeCount,
  missingRecipeCount,
  inactiveCount,
  isLoading = false,
}: ProductCatalogHealthProps) {
  if (isLoading) {
    return (
      <section aria-labelledby="product-catalog-health-heading" className="space-y-2">
        <h2 id="product-catalog-health-heading" className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Catalog Health
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
    <section aria-labelledby="product-catalog-health-heading" className="space-y-2">
      <h2
        id="product-catalog-health-heading"
        className="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
      >
        Catalog Health
      </h2>
      <div className="flex flex-wrap gap-3">
        <HealthMetric tone="success" label="Active Products" value={activeCount} />
        {missingRecipeCount > 0 ? (
          <HealthMetric tone="warning" label="Missing Recipe" value={missingRecipeCount} />
        ) : null}
        {inactiveCount > 0 ? (
          <HealthMetric tone="danger" label="Inactive" value={inactiveCount} />
        ) : null}
      </div>
    </section>
  );
}
