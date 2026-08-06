import type { ReactNode } from 'react';
import Link from 'next/link';

import { StatusBadge } from '@/components/shared/status-badge';

type RecipeDetailSummaryProps = {
  productId: string;
  productName: string;
  batchOutputQuantity: number | null;
  ingredientCount: number;
  isActive: boolean;
  isProductionReady: boolean;
};

function SummaryItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function formatMakes(value: number | null): string {
  if (value === null || value <= 0) {
    return 'Not set';
  }

  return `${value.toLocaleString('en-IN')} per batch`;
}

export function RecipeDetailSummary({
  productId,
  productName,
  batchOutputQuantity,
  ingredientCount,
  isActive,
  isProductionReady,
}: RecipeDetailSummaryProps) {
  const productionStatus = isProductionReady ? (
    <span className="text-success-foreground">Ready for production</span>
  ) : isActive ? (
    <span className="text-warning-foreground">Not linked to product yet</span>
  ) : (
    <span className="text-muted-foreground">Inactive — not used in production</span>
  );

  return (
    <div className="flex flex-wrap gap-x-8 gap-y-3 rounded-lg border bg-muted/30 px-4 py-3">
      <SummaryItem
        label="Product"
        value={
          <Link href={`/products/${productId}`} className="font-semibold text-primary hover:underline">
            {productName}
          </Link>
        }
      />
      <SummaryItem
        label="Batch size (Makes)"
        value={
          <span className="text-lg">
            {batchOutputQuantity != null && batchOutputQuantity > 0
              ? batchOutputQuantity.toLocaleString('en-IN')
              : '—'}
          </span>
        }
      />
      <SummaryItem
        label="Yield"
        value={formatMakes(batchOutputQuantity)}
      />
      <SummaryItem label="Ingredients" value={ingredientCount.toLocaleString('en-IN')} />
      <SummaryItem label="Status" value={<StatusBadge isActive={isActive} />} />
      <SummaryItem label="Production" value={productionStatus} />
    </div>
  );
}
