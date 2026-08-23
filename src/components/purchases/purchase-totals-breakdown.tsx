import { MoneyDisplay } from '@/components/shared/money-display';
import { Card, CardContent } from '@/components/ui/card';

type PurchaseTotalsBreakdownProps = {
  subtotal: number;
  discountAmount: number;
  adjustmentAmount: number;
  finalPayable: number;
};

function Row({
  label,
  amount,
  emphasize,
}: {
  label: string;
  amount: number;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <p className={emphasize ? 'text-sm font-semibold' : 'text-sm text-muted-foreground'}>
        {label}
      </p>
      <p
        className={
          emphasize ? 'text-2xl font-semibold tabular-nums' : 'text-base font-medium tabular-nums'
        }
      >
        <MoneyDisplay amount={amount} />
      </p>
    </div>
  );
}

export function PurchaseTotalsBreakdown({
  subtotal,
  discountAmount,
  adjustmentAmount,
  finalPayable,
}: PurchaseTotalsBreakdownProps) {
  const hasDiscount = discountAmount !== 0;
  const hasAdjustment = adjustmentAmount !== 0;

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <Row label="Subtotal" amount={subtotal} />
        {hasDiscount ? <Row label="Discount" amount={-discountAmount} /> : null}
        {hasDiscount ? <Row label="After discount" amount={subtotal - discountAmount} /> : null}
        {hasAdjustment ? <Row label="Adjustment" amount={adjustmentAmount} /> : null}
        <div className={hasDiscount || hasAdjustment ? 'border-t pt-3' : undefined}>
          <Row label="Final payable" amount={finalPayable} emphasize />
        </div>
      </CardContent>
    </Card>
  );
}
