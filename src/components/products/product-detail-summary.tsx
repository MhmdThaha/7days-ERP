import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { HasRecipeBadge } from '@/components/shared/has-recipe-badge';
import { MoneyDisplay } from '@/components/shared/money-display';
import { StatusBadge } from '@/components/shared/status-badge';
import { StockStatusBadge } from '@/components/shared/stock-status-badge';
import { getProductStockStatus } from '@/lib/domain/stock-status';

type ProductDetailSummaryProps = {
  sellingPrice: number;
  currentStock: number;
  unit: string;
  hasRecipe: boolean;
  activeRecipeId: string | null;
  isActive: boolean;
};

function SummaryItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-medium tabular-nums">{value}</p>
    </div>
  );
}

export function ProductDetailSummary({
  sellingPrice,
  currentStock,
  unit,
  hasRecipe,
  activeRecipeId,
  isActive,
}: ProductDetailSummaryProps) {
  const stockStatus = getProductStockStatus(currentStock);

  return (
    <div className="flex flex-wrap gap-x-8 gap-y-3 rounded-lg border bg-muted/30 px-4 py-3">
      <SummaryItem
        label="Selling price"
        value={
          <span className="text-lg font-semibold">
            <MoneyDisplay amount={sellingPrice} />
          </span>
        }
      />
      <SummaryItem
        label="Current stock"
        value={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="font-semibold">
              {currentStock.toLocaleString('en-IN', { maximumFractionDigits: 3 })} {unit}
            </span>
            <StockStatusBadge status={stockStatus} />
          </span>
        }
      />
      <SummaryItem
        label="Recipe"
        value={
          <span className="inline-flex flex-wrap items-center gap-2">
            <HasRecipeBadge hasRecipe={hasRecipe} />
            {activeRecipeId ? (
              <Link
                href={`/recipes/${activeRecipeId}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                View Recipe
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            ) : null}
          </span>
        }
      />
      <SummaryItem label="Status" value={<StatusBadge isActive={isActive} />} />
    </div>
  );
}
