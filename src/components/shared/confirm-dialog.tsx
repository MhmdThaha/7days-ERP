'use client';

import { Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'default' | 'destructive' | 'success';
  loadingLabel?: string;
  isLoading?: boolean;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'default',
  loadingLabel,
  isLoading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const resolvedLoadingLabel =
    loadingLabel ?? (confirmVariant === 'destructive' ? 'Deleting...' : 'Confirming...');

  function handleOpenChange(nextOpen: boolean) {
    if (isLoading && !nextOpen) {
      return;
    }

    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="px-4 pt-4 sm:px-6">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="break-words">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 px-4 pb-4 sm:gap-2 sm:px-6 sm:pb-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                {resolvedLoadingLabel}
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
