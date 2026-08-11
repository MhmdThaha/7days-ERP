'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type SaleDatePreparationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (isoDate: string) => void;
  onBack: () => void;
  isBusy?: boolean;
};

function todayIsoDate(): string {
  const now = new Date();

  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    .toISOString()
    .slice(0, 10);
}

function formatDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);

  if (!year || !month || !day) {
    return isoDate;
  }

  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function SaleDatePreparationDialog({
  open,
  onOpenChange,
  onConfirm,
  onBack,
  isBusy = false,
}: SaleDatePreparationDialogProps) {
  const [selectedDate, setSelectedDate] = useState(todayIsoDate);

  useEffect(() => {
    if (open) {
      setSelectedDate(todayIsoDate());
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Sale Date was not found in this file.</DialogTitle>
          <DialogDescription>
            Choose one sale date for this import. This date will be applied to all imported sales.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="bulk-sale-date">Sale date</Label>
          <Input
            id="bulk-sale-date"
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            disabled={isBusy}
          />
          {selectedDate ? (
            <p className="text-sm text-muted-foreground">
              Selected: {formatDisplayDate(selectedDate)}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onBack} disabled={isBusy}>
            Back
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(selectedDate)}
            disabled={isBusy || selectedDate.trim() === ''}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
