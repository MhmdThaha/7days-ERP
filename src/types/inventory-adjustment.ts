import type { InventoryItemType, MovementType } from '@/types/inventory';

export type InventoryAdjustmentReason =
  | 'physical_stock_count'
  | 'damage'
  | 'spoilage'
  | 'data_correction'
  | 'other';

export type InventoryAdjustmentStatus = 'draft' | 'completed';

export type InventoryAdjustmentId = string;

export type ConfirmInventoryAdjustmentInput = {
  itemType: InventoryItemType;
  itemId: string;
  physicalCount: number;
  reason: InventoryAdjustmentReason;
  notes?: string | null;
};

export type CreateInventoryAdjustmentDraftInput = ConfirmInventoryAdjustmentInput;

export type InventoryAdjustment = {
  id: InventoryAdjustmentId;
  organizationId: string;
  adjustmentDate: string;
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
  physicalCount: number;
  quantityBefore: number;
  quantityAfter: number;
  quantityDifference: number;
  movementType: Extract<MovementType, 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'>;
  unitCost: number;
  totalCost: number;
  averageCostAfter: number;
  reason: InventoryAdjustmentReason;
  notes: string | null;
  status: InventoryAdjustmentStatus;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  completedAt: Date | null;
  completedBy: string | null;
};
