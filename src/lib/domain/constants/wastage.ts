import type { WastageReason } from '@/types/wastage';

export const WASTAGE_NUMBER_PREFIX = 'WST';

export const WASTAGE_PAGE_SIZE = 25;

export const WASTAGE_STATUSES = ['draft', 'completed'] as const;

export const WASTAGE_REASONS = ['damaged', 'burnt', 'expired', 'other'] as const;

export const WASTAGE_REASON_LABELS: Record<WastageReason, string> = {
  damaged: 'Damaged',
  burnt: 'Burnt',
  expired: 'Expired',
  other: 'Other',
};

export const DUPLICATE_PRODUCT_MESSAGE = 'This product is already added to this wastage entry.';
