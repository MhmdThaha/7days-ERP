import type { ReturnReason } from '@/types/return';

export const RETURN_NUMBER_PREFIX = 'RET';

export const RETURN_PAGE_SIZE = 25;

export const RETURN_STATUSES = ['draft', 'completed'] as const;

export const RETURN_REASONS = ['damaged', 'expired', 'unsold', 'other'] as const;

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  damaged: 'Damaged',
  expired: 'Expired',
  unsold: 'Unsold',
  other: 'Other',
};

export const DUPLICATE_PRODUCT_MESSAGE = 'This product is already added to this return.';
