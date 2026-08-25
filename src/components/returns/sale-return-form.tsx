'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';

import { useReportFormDirtyChange } from '@/hooks/use-report-form-dirty-change';
import { USER_FIELD_SET_VALUE_OPTIONS } from '@/lib/forms/user-field-set-value-options';

import { ReturnTotalBar } from '@/components/returns/return-total-bar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { RETURN_REASONS, RETURN_REASON_LABELS } from '@/lib/domain/constants/return';
import type { ReturnFormValues } from '@/lib/domain/schemas/return.schema';
import { formatMoney } from '@/lib/utils/money';
import { getLocalReturnDateString } from '@/lib/utils/return-form-errors';
import type { ReturnEntry, SaleReturnContext } from '@/types/return';

type SaleReturnFormProps = {
  formId: string;
  saleContext: SaleReturnContext;
  returnEntry?: ReturnEntry;
  onSubmit: (values: ReturnFormValues) => Promise<void>;
  isSubmitting?: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
};

const reasonSelectItems = RETURN_REASONS.map((reason) => ({
  value: reason,
  label: RETURN_REASON_LABELS[reason],
}));

function formatQuantity(value: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

function buildDefaultValues(
  saleContext: SaleReturnContext,
  returnEntry?: ReturnEntry,
): ReturnFormValues {
  const draftQtyBySaleLineId = new Map(
    returnEntry?.lines
      .filter((line) => line.saleLineId)
      .map((line) => [line.saleLineId as string, line.quantity]) ?? [],
  );

  return {
    sourceSaleId: saleContext.saleId,
    returnDate: returnEntry?.returnDate ?? getLocalReturnDateString(),
    reason: returnEntry?.reason ?? 'damaged',
    notes: returnEntry?.notes ?? '',
    lines: saleContext.lines
      .filter((line) => line.remainingReturnableQuantity > 0 || draftQtyBySaleLineId.has(line.saleLineId))
      .map((line) => ({
        saleLineId: line.saleLineId,
        quantity: draftQtyBySaleLineId.get(line.saleLineId) ?? Number.NaN,
      })),
  };
}

export function SaleReturnForm({
  formId,
  saleContext,
  returnEntry,
  onSubmit,
  isSubmitting = false,
  onDirtyChange,
}: SaleReturnFormProps) {
  const defaultValues = useMemo(
    () => buildDefaultValues(saleContext, returnEntry),
    [saleContext, returnEntry],
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    control,
    formState: { errors },
  } = useForm<ReturnFormValues>({
    defaultValues,
  });

  useReportFormDirtyChange(control, onDirtyChange);

  const loadedReturnIdRef = useRef<string | null>(null);

  useEffect(() => {
    const returnId = returnEntry?.id ?? null;

    if (returnId && loadedReturnIdRef.current === returnId) {
      return;
    }

    loadedReturnIdRef.current = returnId;
    reset(defaultValues);
  }, [defaultValues, reset, returnEntry?.id]);

  const lines = watch('lines');
  const reason = watch('reason');

  const { lineCount, totalUnits, refundTotal } = useMemo(() => {
    let units = 0;
    let refund = 0;

    for (const line of lines) {
      if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
        continue;
      }

      units += line.quantity;

      const saleLine = saleContext.lines.find((entry) => entry.saleLineId === line.saleLineId);

      if (saleLine) {
        refund += Math.round(line.quantity * saleLine.sellingPriceSnapshot);
      }
    }

    return {
      lineCount: lines.filter((line) => Number.isFinite(line.quantity) && line.quantity > 0).length,
      totalUnits: units,
      refundTotal: refund,
    };
  }, [lines, saleContext.lines]);

  return (
    <form id={formId} className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
      <div className="rounded-lg border bg-muted/30 p-4 text-sm">
        <p className="font-medium">{saleContext.saleNumber}</p>
        <p className="text-muted-foreground">
          Sold on {saleContext.saleDate}
          {saleContext.customerNameSnapshot ? ` ? ${saleContext.customerNameSnapshot}` : ''}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="returnDate">Return Date</Label>
          <Input id="returnDate" type="date" disabled={isSubmitting} {...register('returnDate')} />
          {errors.returnDate ? (
            <p className="text-sm text-destructive">{errors.returnDate.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="reason">Reason</Label>
          <Select
            value={reason}
            onValueChange={(value) =>
              setValue('reason', value as ReturnFormValues['reason'], USER_FIELD_SET_VALUE_OPTIONS)
            }
            disabled={isSubmitting}
          >
            <SelectTrigger id="reason">
              <SelectValue placeholder="Select reason" />
            </SelectTrigger>
            <SelectContent>
              {reasonSelectItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.reason ? (
            <p className="text-sm text-destructive">{errors.reason.message}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <Label>Products from this sale</Label>
        <div className="divide-y rounded-lg border">
          {saleContext.lines
            .filter(
              (line) =>
                line.remainingReturnableQuantity > 0 ||
                returnEntry?.lines.some((entry) => entry.saleLineId === line.saleLineId),
            )
            .map((saleLine, index) => {
              const lineError = errors.lines?.[index]?.quantity;

              return (
                <div key={saleLine.saleLineId} className="space-y-3 p-4">
                  <div>
                    <p className="font-medium">{saleLine.productNameSnapshot}</p>
                    <p className="text-sm text-muted-foreground">
                      Sold {formatQuantity(saleLine.soldQuantity)} {saleLine.unit}
                      {saleLine.returnedQuantity > 0
                        ? ` ? Already returned ${formatQuantity(saleLine.returnedQuantity)}`
                        : ''}
                      {' ? Available '}
                      {formatQuantity(saleLine.remainingReturnableQuantity)} {saleLine.unit}
                      {' ? Price '}
                      {formatMoney(saleLine.sellingPriceSnapshot)}
                    </p>
                  </div>

                  <input
                    type="hidden"
                    {...register(`lines.${index}.saleLineId` as const)}
                    defaultValue={saleLine.saleLineId}
                  />

                  <div className="max-w-xs space-y-2">
                    <Label htmlFor={`return-qty-${saleLine.saleLineId}`}>Return quantity</Label>
                    <Input
                      id={`return-qty-${saleLine.saleLineId}`}
                      type="number"
                      min={0}
                      max={saleLine.remainingReturnableQuantity}
                      step="any"
                      inputMode="decimal"
                      disabled={isSubmitting}
                      {...register(`lines.${index}.quantity` as const, {
                        valueAsNumber: true,
                        min: {
                          value: 0,
                          message: 'Quantity cannot be negative.',
                        },
                        max: {
                          value: saleLine.remainingReturnableQuantity,
                          message: `Only ${saleLine.remainingReturnableQuantity} ${saleLine.unit} remain available to return.`,
                        },
                      })}
                    />
                    {lineError ? (
                      <p className="text-sm text-destructive">{lineError.message}</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      <ReturnTotalBar lineCount={lineCount} totalUnits={totalUnits} />

      <div className="rounded-lg border bg-muted/20 p-4">
        <p className="text-sm font-medium text-muted-foreground">Estimated refund</p>
        <p className="text-2xl font-semibold tabular-nums">{formatMoney(refundTotal)}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" rows={3} disabled={isSubmitting} {...register('notes')} />
      </div>
    </form>
  );
}
