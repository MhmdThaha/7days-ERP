import 'server-only';

import { Timestamp, type Transaction } from 'firebase-admin/firestore';

import { getOrgCollection } from '@/lib/repositories/base.repository';
import type { CreateInventoryMovementInput } from '@/types/inventory';

type InventoryMovementDocument = {
  organizationId: string;
  movementDate: string;
  itemType: CreateInventoryMovementInput['itemType'];
  itemId: string;
  itemName: string;
  movementType: CreateInventoryMovementInput['movementType'];
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

export function getInventoryMovementsCollection(orgId: string) {
  return getOrgCollection(orgId, 'inventoryMovements');
}

export const inventoryRepository = {
  createMovementInTransaction(
    transaction: Transaction,
    orgId: string,
    input: CreateInventoryMovementInput,
    userId: string,
  ): string {
    const docRef = getInventoryMovementsCollection(orgId).doc();
    const now = Timestamp.now();

    const document: InventoryMovementDocument = {
      organizationId: orgId,
      movementDate: input.movementDate,
      itemType: input.itemType,
      itemId: input.itemId,
      itemName: input.itemName,
      movementType: input.movementType,
      quantity: input.quantity,
      unit: input.unit,
      unitCost: input.unitCost,
      totalCost: input.totalCost,
      balanceAfter: input.balanceAfter,
      averageCostAfter: input.averageCostAfter,
      sourceDocumentType: input.sourceDocumentType,
      sourceDocumentId: input.sourceDocumentId,
      sourceLineId: input.sourceLineId,
      reversalOfMovementId: null,
      notes: input.notes ?? null,
      createdAt: now,
      createdBy: userId,
    };

    transaction.set(docRef, document);
    return docRef.id;
  },
};
