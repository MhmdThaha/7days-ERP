'use client';

import { MoneyDisplay } from '@/components/shared/money-display';
import { MoneyInput } from '@/components/shared/money-input';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import type { PurchaseTotals } from '@/lib/domain/calculations/purchase-pricing';

type PurchaseTotalsFieldsProps = {
  totals: PurchaseTotals;
  discountError?: string;
  adjustmentError?: string;
  disabled?: boolean;
  onDiscountChange: (value: number) => void;
  onAdjustmentChange: (value: number) => void;
};

function TotalsRow({
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
          emphasize
            ? 'text-2xl font-semibold tabular-nums'
            : 'text-base font-medium tabular-nums'
        }
      >
        <MoneyDisplay amount={amount} />
      </p>
    </div>
  );
}

export function PurchaseTotalsFields({
  totals,
  discountError,
  adjustmentError,
  disabled = false,
  onDiscountChange,
  onAdjustmentChange,
}: PurchaseTotalsFieldsProps) {
  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <TotalsRow label="Subtotal" amount={totals.subtotal} />

        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Label htmlFor="discountAmount" className="text-sm text-muted-foreground">
              Discount
            </Label>
            <MoneyInput
              id="discountAmount"
              className="w-full sm:max-w-48"
              value={totals.discountAmount}
              onChange={onDiscountChange}
              disabled={disabled}
              aria-invalid={Boolean(discountError)}
              aria-describedby={discountError ? 'discountAmount-error' : 'discountAmount-hint'}
            />
          </div>
          {discountError ? (
            <p id="discountAmount-error" className="text-sm text-destructive" role="alert">
              {discountError}
            </p>
          ) : (
            <p id="discountAmount-hint" className="text-sm text-muted-foreground">
              Optional. Cannot be more than the subtotal.
            </p>
          )}
        </div>

        <TotalsRow label="After discount" amount={totals.discountedTotal} />

        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Label htmlFor="adjustmentAmount" className="text-sm text-muted-foreground">
              Adjustment
            </Label>
            <MoneyInput
              id="adjustmentAmount"
              className="w-full sm:max-w-48"
              value={totals.adjustmentAmount}
              onChange={onAdjustmentChange}
              disabled={disabled}
              allowNegative
              aria-invalid={Boolean(adjustmentError)}
              aria-describedby={
                adjustmentError ? 'adjustmentAmount-error' : 'adjustmentAmount-hint'
              }
            />
          </div>
          {adjustmentError ? (
            <p id="adjustmentAmount-error" className="text-sm text-destructive" role="alert">
              {adjustmentError}
            </p>
          ) : (
            <p id="adjustmentAmount-hint" className="text-sm text-muted-foreground">
              Optional invoice round-off. Minus is allowed.
            </p>
          )}
        </div>

        <div className="border-t pt-3">
          <TotalsRow label="Final payable" amount={totals.finalPayable} emphasize />
        </div>
      </CardContent>
    </Card>
  );
}
