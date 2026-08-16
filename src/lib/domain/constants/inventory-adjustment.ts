import type { InventoryAdjustmentReason } from '@/types/inventory-adjustment';

export const INVENTORY_ADJUSTMENT_REASONS = [
  'physical_stock_count',
  'damage',
  'spoilage',
  'data_correction',
  'other',
] as const satisfies readonly InventoryAdjustmentReason[];

export const INVENTORY_ADJUSTMENT_REASON_LABELS: Record<InventoryAdjustmentReason, string> = {
  physical_stock_count: 'Physical stock count',
  damage: 'Damage',
  spoilage: 'Spoilage',
  data_correction: 'Data correction',
  other: 'Other',
};
