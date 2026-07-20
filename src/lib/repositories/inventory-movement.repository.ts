import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';

import { timestampToDate } from '@/lib/firebase/converters';
import { getInventoryMovementsCollection } from '@/lib/repositories/inventory.repository';
import type { InventoryMovement, MovementType } from '@/types/inventory';

type InventoryMovementDocument = {
  organizationId: string;
  movementDate: string;
  itemType: InventoryMovement['itemType'];
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
  reversalOfMovementId: string | null;
  notes: string | null;
  createdAt: Timestamp;
  createdBy: string;
};

function toMovement(id: string, data: InventoryMovementDocument): InventoryMovement {
  return {
    id,
    organizationId: data.organizationId,
    movementDate: data.movementDate,
    itemType: data.itemType,
    itemId: data.itemId,
    itemName: data.itemName,
    movementType: data.movementType,
    quantity: data.quantity,
    unit: data.unit,
    unitCost: data.unitCost,
    totalCost: data.totalCost,
    balanceAfter: data.balanceAfter,
    averageCostAfter: data.averageCostAfter,
    sourceDocumentType: data.sourceDocumentType,
    sourceDocumentId: data.sourceDocumentId,
    sourceLineId: data.sourceLineId,
    notes: data.notes,
    createdAt: timestampToDate(data.createdAt) ?? new Date(),
    createdBy: data.createdBy,
  };
}

export const inventoryMovementRepository = {
  async listByDate(orgId: string, date: string): Promise<InventoryMovement[]> {
    const snapshot = await getInventoryMovementsCollection(orgId)
      .where('movementDate', '==', date)
      .get();

    return snapshot.docs
      .map((doc) => toMovement(doc.id, doc.data() as InventoryMovementDocument))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  },

  async sumTotalCostByMovementType(
    orgId: string,
    date: string,
    movementType: MovementType,
  ): Promise<number> {
    const movements = await this.listByDate(orgId, date);

    return movements
      .filter((movement) => movement.movementType === movementType)
      .reduce((sum, movement) => sum + movement.totalCost, 0);
  },
};
