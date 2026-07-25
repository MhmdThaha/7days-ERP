import { toast } from 'sonner';

type ToastAction = {
  label: string;
  onClick: () => void;
};

export function toastWithAction(message: string, action: ToastAction) {
  toast.success(message, { action });
}

export function toastDraftSaved(message: string, completeLabel: string, onComplete: () => void) {
  toastWithAction(message, { label: completeLabel, onClick: onComplete });
}

export function toastWorkflowComplete(
  message: string,
  options?: {
    nextStep?: ToastAction;
    recordAnother?: ToastAction;
  },
) {
  const action = options?.nextStep ?? options?.recordAnother;

  if (action) {
    toast.success(message, { action });
    return;
  }

  toast.success(message);
}
