import type { ReactNode } from 'react';

type ProductionDetailSummaryProps = {
  productionDateLabel: string;
  totalUnitsLabel: string;
  productLineCount: number;
  isDraft: boolean;
  isPreviewLoading?: boolean;
  shortageCount?: number;
};

function SummaryItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-medium tabular-nums">{value}</p>
    </div>
  );
}

export function ProductionDetailSummary({
  productionDateLabel,
  totalUnitsLabel,
  productLineCount,
  isDraft,
  isPreviewLoading = false,
  shortageCount = 0,
}: ProductionDetailSummaryProps) {
  let ingredientsStatus: ReactNode;

  if (isDraft) {
    if (isPreviewLoading) {
      ingredientsStatus = (
        <span className="text-muted-foreground">Checking ingredients…</span>
      );
    } else if (shortageCount > 0) {
      ingredientsStatus = (
        <span className="text-warning-foreground">
          {shortageCount} ingredient{shortageCount === 1 ? '' : 's'} short
        </span>
      );
    } else {
      ingredientsStatus = <span className="text-success-foreground">All in stock</span>;
    }
  } else {
    ingredientsStatus = <span className="text-success-foreground">Stock updated</span>;
  }

  return (
    <div className="flex flex-wrap gap-x-8 gap-y-3 rounded-lg border bg-muted/30 px-4 py-3">
      <SummaryItem label="Production date" value={productionDateLabel} />
      <SummaryItem label="Total units" value={totalUnitsLabel} />
      <SummaryItem label="Products" value={productLineCount} />
      <SummaryItem label="Ingredients" value={ingredientsStatus} />
    </div>
  );
}
