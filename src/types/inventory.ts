export type InventoryItemType = 'raw_material' | 'finished_product';

export type MovementType =
  | 'PURCHASE_IN'
  | 'PRODUCTION_RAW_OUT'
  | 'PRODUCTION_FINISHED_IN'
  | 'SALE_OUT'
  | 'WASTAGE_OUT'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'OPENING_BALANCE'
  | 'REVERSAL';

export type InventoryMovementId = string;

export type CreateInventoryMovementInput = {
  movementDate: string;
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  movementType: MovementType;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  balanceAfter: number;
  averageCostAfter: number;
  sourceDocumentType: string;
  sourceDocumentId: string;
  sourceLineId: string | null;
  notes?: string | null;
};
