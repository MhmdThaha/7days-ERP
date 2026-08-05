'use client';

import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type RecipeChangedDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isUpdating?: boolean;
  onUpdateDraft: () => void;
  onContinueWithCurrentDraft: () => void;
  onClose: () => void;
};

export function RecipeChangedDialog({
  open,
  onOpenChange,
  isUpdating = false,
  onUpdateDraft,
  onContinueWithCurrentDraft,
  onClose,
}: RecipeChangedDialogProps) {
  function handleOpenChange(nextOpen: boolean) {
    if (isUpdating && !nextOpen) {
      return;
    }

    if (!nextOpen) {
      onClose();
    }

    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="px-4 pt-4 sm:px-6">
          <DialogTitle>Recipe Changed</DialogTitle>
          <DialogDescription className="break-words">
            This recipe was updated after this draft was created. Updating the draft will use the
            latest recipe. No inventory, costing or accounting has been affected.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 px-4 pb-4 sm:flex-col sm:px-6 sm:pb-6">
          <Button type="button" onClick={onUpdateDraft} disabled={isUpdating} className="w-full">
            {isUpdating ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Updating draft...
              </>
            ) : (
              'Update Draft'
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onContinueWithCurrentDraft}
            disabled={isUpdating}
            className="w-full"
          >
            Continue with Current Draft
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isUpdating}
            className="w-full"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
