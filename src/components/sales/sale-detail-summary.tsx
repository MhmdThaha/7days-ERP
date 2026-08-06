import type { ReactNode } from 'react';

import { MoneyDisplay } from '@/components/shared/money-display';

type SaleDetailSummaryProps = {
  saleDateLabel: string;
  customerLabel: string;
  subtotal: number;
  productLineCount: number;
  isDraft: boolean;
};

function SummaryItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-medium tabular-nums">{value}</p>
    </div>
  );
}

export function SaleDetailSummary({
  saleDateLabel,
  customerLabel,
  subtotal,
  productLineCount,
  isDraft,
}: SaleDetailSummaryProps) {
  const stockStatus = isDraft ? (
    <span className="text-warning-foreground">Stock not deducted yet</span>
  ) : (
    <span className="text-success-foreground">Stock updated</span>
  );

  return (
    <div className="flex flex-wrap gap-x-8 gap-y-3 rounded-lg border bg-muted/30 px-4 py-3">
      <SummaryItem label="Sale date" value={saleDateLabel} />
      <SummaryItem label="Customer" value={customerLabel} />
      <SummaryItem
        label="Subtotal"
        value={
          <span className="text-lg font-semibold">
            <MoneyDisplay amount={subtotal} />
          </span>
        }
      />
      <SummaryItem label="Products" value={productLineCount} />
      <SummaryItem label="Stock" value={stockStatus} />
    </div>
  );
}
