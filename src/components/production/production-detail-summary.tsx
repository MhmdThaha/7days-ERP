import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type ProductionDetailSummaryProps = {
  productionDateLabel: string;
  totalUnitsLabel: string;
  productLineCount: number;
  isDraft: boolean;
  isPreviewLoading?: boolean;
  shortageCount?: number;
};

function SummaryItem({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p
        className={cn(
          'mt-1 tabular-nums',
          emphasize ? 'text-lg font-semibold' : 'text-base font-medium',
        )}
      >
        {value}
      </p>
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
  let tone: 'neutral' | 'success' | 'danger' = 'neutral';

  if (isDraft) {
    if (isPreviewLoading) {
      ingredientsStatus = (
        <span className="text-muted-foreground">Checking ingredients…</span>
      );
      tone = 'neutral';
    } else if (shortageCount > 0) {
      ingredientsStatus = (
        <span className="font-semibold text-destructive">
          {shortageCount} ingredient{shortageCount === 1 ? '' : 's'} short
        </span>
      );
      tone = 'danger';
    } else {
      ingredientsStatus = (
        <span className="font-semibold text-success-foreground">All in stock</span>
      );
      tone = 'success';
    }
  } else {
    ingredientsStatus = (
      <span className="font-semibold text-success-foreground">Stock updated</span>
    );
    tone = 'success';
  }

  return (
    <div
      className={cn(
        'flex flex-wrap gap-x-10 gap-y-4 rounded-lg border px-4 py-3.5',
        tone === 'danger' && 'border-destructive/25 bg-destructive/5',
        tone === 'success' && 'border-success/25 bg-success/5',
        tone === 'neutral' && 'bg-muted/30',
      )}
    >
      <SummaryItem label="Production date" value={productionDateLabel} />
      <SummaryItem label="Total units" value={totalUnitsLabel} emphasize />
      <SummaryItem label="Products" value={productLineCount} />
      <SummaryItem label="Ingredients" value={ingredientsStatus} />
    </div>
  );
}
