import { toast } from 'sonner';

import { toUserFriendlyError } from '@/lib/utils/user-friendly-error';

export function toastFormError(message: string): void {
  toast.error(toUserFriendlyError(message));
}
