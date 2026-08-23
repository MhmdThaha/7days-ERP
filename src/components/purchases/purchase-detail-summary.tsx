import type { ReactNode } from 'react';

import { PaymentStatusBadge } from '@/components/purchases/payment-status-badge';
import { MoneyDisplay } from '@/components/shared/money-display';
import type { PaymentStatus } from '@/types/purchase';

type PurchaseDetailSummaryProps = {
  purchaseDateLabel: string;
  supplierLabel: string;
  grandTotal: number;
  lineItemCount: number;
  paymentStatus: PaymentStatus;
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

export function PurchaseDetailSummary({
  purchaseDateLabel,
  supplierLabel,
  grandTotal,
  lineItemCount,
  paymentStatus,
  isDraft,
}: PurchaseDetailSummaryProps) {
  const stockStatus = isDraft ? (
    <span className="text-warning-foreground">Stock not received yet</span>
  ) : (
    <span className="text-success-foreground">Stock received</span>
  );

  return (
    <div className="flex flex-wrap gap-x-8 gap-y-3 rounded-lg border bg-muted/30 px-4 py-3">
      <SummaryItem label="Purchase date" value={purchaseDateLabel} />
      <SummaryItem label="Supplier" value={supplierLabel} />
      <SummaryItem
        label="Final payable"
        value={
          <span className="text-lg font-semibold">
            <MoneyDisplay amount={grandTotal} />
          </span>
        }
      />
      <SummaryItem label="Line items" value={lineItemCount} />
      <SummaryItem label="Payment" value={<PaymentStatusBadge paymentStatus={paymentStatus} />} />
      <SummaryItem label="Stock" value={stockStatus} />
    </div>
  );
}
