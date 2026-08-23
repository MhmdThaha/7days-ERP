'use client';

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

import { confirmInventoryAdjustmentAction } from '@/actions/inventory-adjustment';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  INVENTORY_ADJUSTMENT_REASON_LABELS,
  INVENTORY_ADJUSTMENT_REASONS,
} from '@/lib/domain/constants/inventory-adjustment';
import { previewPhysicalCountChange } from '@/lib/domain/inventory/adjustment';
import { DomainError } from '@/lib/domain/errors';
import type { InventoryAdjustmentReason } from '@/types/inventory-adjustment';
import type { InventoryItemType } from '@/types/inventory';
import { invalidateInventoryStockQueriesForItemType } from '@/lib/utils/query-invalidation';
import { toastFormError } from '@/lib/utils/toast-form-error';
import { toastWorkflowComplete } from '@/lib/utils/workflow-toasts';

export type InventoryAdjustTarget = {
  itemType: InventoryItemType;
  itemId: string;
  name: string;
  unit: string;
  currentStock: number;
};

type InventoryAdjustDialogProps = {
  target: InventoryAdjustTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatQty(value: number, unit: string): string {
  return `${value.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${unit}`;
}

export function InventoryAdjustDialog({ target, open, onOpenChange }: InventoryAdjustDialogProps) {
  const queryClient = useQueryClient();
  const [physicalCountInput, setPhysicalCountInput] = useState('');
  const [reason, setReason] = useState<InventoryAdjustmentReason>('physical_stock_count');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const preview = useMemo(() => {
    if (!target) {
      return null;
    }

    const trimmed = physicalCountInput.trim();

    if (trimmed === '') {
      return { status: 'empty' as const };
    }

    const physicalCount = Number(trimmed);

    try {
      const previewPlan = previewPhysicalCountChange({
        currentStock: target.currentStock,
        physicalCount,
      });

      return { status: 'ready' as const, plan: previewPlan, physicalCount };
    } catch (error) {
      const message =
        error instanceof DomainError ? error.message : 'Enter a valid physical count.';
      return { status: 'invalid' as const, message };
    }
  }, [physicalCountInput, target]);

  function resetForm() {
    setPhysicalCountInput('');
    setReason('physical_stock_count');
    setNotes('');
  }

  function handleOpenChange(nextOpen: boolean) {
    if (isSubmitting && !nextOpen) {
      return;
    }

    if (!nextOpen) {
      resetForm();
    }

    onOpenChange(nextOpen);
  }

  async function handleConfirm() {
    if (!target || isSubmitting || preview?.status !== 'ready') {
      return;
    }

    if (reason === 'other' && !notes.trim()) {
      toastFormError('Add a note when the reason is Other.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await confirmInventoryAdjustmentAction({
        itemType: target.itemType,
        itemId: target.itemId,
        physicalCount: preview.physicalCount,
        reason,
        notes: notes.trim() ? notes.trim() : null,
      });

      if (!result.success) {
        toastFormError(result.error);
        return;
      }

      toastWorkflowComplete(
        `Stock updated to ${formatQty(result.data.quantityAfter, result.data.unit)}.`,
      );
      await invalidateInventoryStockQueriesForItemType(queryClient, target.itemType);
      handleOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  const differenceLabel =
    preview?.status === 'ready'
      ? `${preview.plan.quantityDifference > 0 ? '+' : ''}${preview.plan.quantityDifference.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${target?.unit ?? ''}`
      : '—';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="px-4 pt-4 sm:px-6">
          <DialogTitle>Adjust Inventory</DialogTitle>
          <DialogDescription>
            Enter what you counted. The system calculates the difference.
          </DialogDescription>
        </DialogHeader>

        {target ? (
          <div className="space-y-4 px-4 py-4 sm:px-6">
            <div>
              <p className="text-sm text-muted-foreground">Item</p>
              <p className="text-base font-medium">{target.name}</p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Current stock</p>
              <p className="text-base tabular-nums">{formatQty(target.currentStock, target.unit)}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inventory-physical-count">Physical count</Label>
              <Input
                id="inventory-physical-count"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={physicalCountInput}
                onChange={(event) => setPhysicalCountInput(event.target.value)}
                className="h-11 min-h-11"
                aria-invalid={preview?.status === 'invalid'}
              />
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Difference</p>
              <p className="text-base font-medium tabular-nums">{differenceLabel}</p>
              {preview?.status === 'invalid' ? (
                <p className="mt-1 text-sm text-destructive">{preview.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="inventory-adjust-reason">Reason</Label>
              <select
                id="inventory-adjust-reason"
                className="h-11 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
                value={reason}
                onChange={(event) =>
                  setReason(event.target.value as InventoryAdjustmentReason)
                }
              >
                {INVENTORY_ADJUSTMENT_REASONS.map((value) => (
                  <option key={value} value={value}>
                    {INVENTORY_ADJUSTMENT_REASON_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inventory-adjust-notes">
                Notes{reason === 'other' ? ' (required)' : ' (optional)'}
              </Label>
              <Textarea
                id="inventory-adjust-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={1000}
              />
            </div>

            <div>
              <p className="text-sm text-muted-foreground">New stock</p>
              <p className="text-base font-medium tabular-nums">
                {preview?.status === 'ready' && target
                  ? formatQty(preview.plan.quantityAfter, target.unit)
                  : '—'}
              </p>
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2 px-4 pb-4 sm:px-6 sm:pb-6">
          <Button
            type="button"
            variant="outline"
            className="h-11 min-h-11"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="success"
            className="h-11 min-h-11"
            onClick={() => void handleConfirm()}
            disabled={isSubmitting || preview?.status !== 'ready'}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Saving...
              </>
            ) : (
              'Confirm Adjustment'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
