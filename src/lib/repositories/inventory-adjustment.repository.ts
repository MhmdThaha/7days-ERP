import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';

import { planInventoryAdjustment } from '@/lib/domain/inventory/adjustment';
import { DomainError } from '@/lib/domain/errors';
import { normalizeNullableString, timestampToDate } from '@/lib/firebase/converters';
import {
  buildAuditFields,
  getFirestore,
  getOrgCollection,
} from '@/lib/repositories/base.repository';
import { inventoryRepository } from '@/lib/repositories/inventory.repository';
import { getLocalDateString } from '@/lib/utils/date';
import type { InventoryItemType } from '@/types/inventory';
import type {
  ConfirmInventoryAdjustmentInput,
  CreateInventoryAdjustmentDraftInput,
  InventoryAdjustment,
} from '@/types/inventory-adjustment';

type StockItemDocument = {
  deletedAt: Timestamp | null;
  isActive: boolean;
  currentStock: number;
  averageCost: number;
  name: string;
  code: string;
  unit: string;
};

type InventoryAdjustmentDocument = {
  organizationId: string;
  adjustmentDate: string;
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
  physicalCount: number;
  quantityBefore: number | null;
  quantityAfter: number | null;
  quantityDifference: number | null;
  movementType: InventoryAdjustment['movementType'] | null;
  unitCost: number | null;
  totalCost: number | null;
  averageCostAfter: number | null;
  reason: InventoryAdjustment['reason'];
  notes: string | null;
  status: InventoryAdjustment['status'];
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  completedAt: Timestamp | null;
  completedBy: string | null;
  deletedAt: Timestamp | null;
  deletedBy: string | null;
};

function itemCollectionName(itemType: InventoryItemType) {
  return itemType === 'raw_material' ? 'rawMaterials' : 'products';
}

function toAdjustment(id: string, data: InventoryAdjustmentDocument): InventoryAdjustment {
  if (
    data.status !== 'completed' ||
    data.quantityBefore === null ||
    data.quantityAfter === null ||
    data.quantityDifference === null ||
    data.movementType === null ||
    data.unitCost === null ||
    data.totalCost === null ||
    data.averageCostAfter === null
  ) {
    throw new DomainError('VALIDATION_ERROR', 'Inventory adjustment is not completed');
  }

  return {
    id,
    organizationId: data.organizationId,
    adjustmentDate: data.adjustmentDate,
    itemType: data.itemType,
    itemId: data.itemId,
    itemName: data.itemName,
    itemCode: data.itemCode,
    unit: data.unit,
    physicalCount: data.physicalCount,
    quantityBefore: data.quantityBefore,
    quantityAfter: data.quantityAfter,
    quantityDifference: data.quantityDifference,
    movementType: data.movementType,
    unitCost: data.unitCost,
    totalCost: data.totalCost,
    averageCostAfter: data.averageCostAfter,
    reason: data.reason,
    notes: data.notes,
    status: data.status,
    createdAt: timestampToDate(data.createdAt) ?? new Date(),
    createdBy: data.createdBy,
    updatedAt: timestampToDate(data.updatedAt) ?? new Date(),
    updatedBy: data.updatedBy,
    completedAt: timestampToDate(data.completedAt),
    completedBy: data.completedBy ?? null,
  };
}

function assertUsableItem(data: StockItemDocument, itemLabel: string): void {
  if (data.deletedAt) {
    throw new DomainError('NOT_FOUND', `${itemLabel} was not found`);
  }

  if (!data.isActive) {
    throw new DomainError('VALIDATION_ERROR', `${itemLabel} is inactive`);
  }
}

export const inventoryAdjustmentRepository = {
  async createDraft(
    orgId: string,
    input: CreateInventoryAdjustmentDraftInput,
    userId: string,
  ): Promise<{ id: string; status: 'draft' }> {
    const itemRef = getOrgCollection(orgId, itemCollectionName(input.itemType)).doc(input.itemId);
    const itemSnap = await itemRef.get();

    if (!itemSnap.exists) {
      throw new DomainError('NOT_FOUND', 'Inventory item was not found');
    }

    const itemData = itemSnap.data() as StockItemDocument;
    assertUsableItem(itemData, itemData.name || 'Inventory item');

    const collection = getOrgCollection(orgId, 'inventoryAdjustments');
    const docRef = collection.doc();
    const now = Timestamp.now();

    const document: InventoryAdjustmentDocument = {
      organizationId: orgId,
      adjustmentDate: getLocalDateString(),
      itemType: input.itemType,
      itemId: input.itemId,
      itemName: itemData.name,
      itemCode: itemData.code,
      unit: itemData.unit,
      physicalCount: input.physicalCount,
      quantityBefore: null,
      quantityAfter: null,
      quantityDifference: null,
      movementType: null,
      unitCost: null,
      totalCost: null,
      averageCostAfter: null,
      reason: input.reason,
      notes: normalizeNullableString(input.notes),
      status: 'draft',
      createdAt: now,
      createdBy: userId,
      updatedAt: now,
      updatedBy: userId,
      completedAt: null,
      completedBy: null,
      deletedAt: null,
      deletedBy: null,
    };

    await docRef.set(document);
    return { id: docRef.id, status: 'draft' };
  },

  async complete(orgId: string, adjustmentId: string, userId: string): Promise<InventoryAdjustment> {
    const firestore = getFirestore();

    return firestore.runTransaction(async (transaction) => {
      const adjustmentRef = getOrgCollection(orgId, 'inventoryAdjustments').doc(adjustmentId);
      const adjustmentSnap = await transaction.get(adjustmentRef);

      if (!adjustmentSnap.exists) {
        throw new DomainError('NOT_FOUND', 'Inventory adjustment was not found');
      }

      const adjustmentData = adjustmentSnap.data() as InventoryAdjustmentDocument;

      if (adjustmentData.deletedAt) {
        throw new DomainError('NOT_FOUND', 'Inventory adjustment was not found');
      }

      if (adjustmentData.status !== 'draft') {
        throw new DomainError(
          'VALIDATION_ERROR',
          'This inventory adjustment has already been completed',
        );
      }

      const itemRef = getOrgCollection(
        orgId,
        itemCollectionName(adjustmentData.itemType),
      ).doc(adjustmentData.itemId);
      const itemSnap = await transaction.get(itemRef);

      if (!itemSnap.exists) {
        throw new DomainError('NOT_FOUND', 'Inventory item was not found');
      }

      const itemData = itemSnap.data() as StockItemDocument;
      assertUsableItem(itemData, itemData.name || 'Inventory item');

      const plan = planInventoryAdjustment({
        currentStock: itemData.currentStock ?? 0,
        averageCost: itemData.averageCost ?? 0,
        physicalCount: adjustmentData.physicalCount,
        itemName: itemData.name,
      });

      const audit = buildAuditFields(userId, false);
      const now = Timestamp.now();

      transaction.update(itemRef, {
        currentStock: plan.quantityAfter,
        ...audit,
      });

      inventoryRepository.createMovementInTransaction(
        transaction,
        orgId,
        {
          movementDate: adjustmentData.adjustmentDate,
          itemType: adjustmentData.itemType,
          itemId: adjustmentData.itemId,
          itemName: itemData.name,
          movementType: plan.movementType,
          quantity: plan.movementQuantity,
          unit: itemData.unit,
          unitCost: plan.unitCost,
          totalCost: plan.totalCost,
          balanceAfter: plan.quantityAfter,
          averageCostAfter: plan.averageCostAfter,
          sourceDocumentType: 'adjustment',
          sourceDocumentId: adjustmentId,
          sourceLineId: null,
          notes: adjustmentData.notes,
        },
        userId,
      );

      const completed: InventoryAdjustmentDocument = {
        ...adjustmentData,
        itemName: itemData.name,
        itemCode: itemData.code,
        unit: itemData.unit,
        quantityBefore: plan.quantityBefore,
        quantityAfter: plan.quantityAfter,
        quantityDifference: plan.quantityDifference,
        movementType: plan.movementType,
        unitCost: plan.unitCost,
        totalCost: plan.totalCost,
        averageCostAfter: plan.averageCostAfter,
        status: 'completed',
        completedAt: now,
        completedBy: userId,
        updatedAt: now,
        updatedBy: userId,
      };

      transaction.update(adjustmentRef, {
        itemName: completed.itemName,
        itemCode: completed.itemCode,
        unit: completed.unit,
        quantityBefore: completed.quantityBefore,
        quantityAfter: completed.quantityAfter,
        quantityDifference: completed.quantityDifference,
        movementType: completed.movementType,
        unitCost: completed.unitCost,
        totalCost: completed.totalCost,
        averageCostAfter: completed.averageCostAfter,
        status: completed.status,
        completedAt: completed.completedAt,
        completedBy: completed.completedBy,
        updatedAt: completed.updatedAt,
        updatedBy: completed.updatedBy,
      });

      return toAdjustment(adjustmentSnap.id, completed);
    });
  },

  async confirm(
    orgId: string,
    input: ConfirmInventoryAdjustmentInput,
    userId: string,
  ): Promise<InventoryAdjustment> {
    const firestore = getFirestore();

    return firestore.runTransaction(async (transaction) => {
      const itemRef = getOrgCollection(orgId, itemCollectionName(input.itemType)).doc(input.itemId);
      const itemSnap = await transaction.get(itemRef);

      if (!itemSnap.exists) {
        throw new DomainError('NOT_FOUND', 'Inventory item was not found');
      }

      const itemData = itemSnap.data() as StockItemDocument;
      assertUsableItem(itemData, itemData.name || 'Inventory item');

      const plan = planInventoryAdjustment({
        currentStock: itemData.currentStock ?? 0,
        averageCost: itemData.averageCost ?? 0,
        physicalCount: input.physicalCount,
        itemName: itemData.name,
      });

      const adjustmentRef = getOrgCollection(orgId, 'inventoryAdjustments').doc();
      const now = Timestamp.now();
      const notes = normalizeNullableString(input.notes);
      const adjustmentDate = getLocalDateString();

      const document: InventoryAdjustmentDocument = {
        organizationId: orgId,
        adjustmentDate,
        itemType: input.itemType,
        itemId: input.itemId,
        itemName: itemData.name,
        itemCode: itemData.code,
        unit: itemData.unit,
        physicalCount: input.physicalCount,
        quantityBefore: plan.quantityBefore,
        quantityAfter: plan.quantityAfter,
        quantityDifference: plan.quantityDifference,
        movementType: plan.movementType,
        unitCost: plan.unitCost,
        totalCost: plan.totalCost,
        averageCostAfter: plan.averageCostAfter,
        reason: input.reason,
        notes,
        status: 'completed',
        createdAt: now,
        createdBy: userId,
        updatedAt: now,
        updatedBy: userId,
        completedAt: now,
        completedBy: userId,
        deletedAt: null,
        deletedBy: null,
      };

      transaction.set(adjustmentRef, document);

      const audit = buildAuditFields(userId, false);

      transaction.update(itemRef, {
        currentStock: plan.quantityAfter,
        ...audit,
      });

      inventoryRepository.createMovementInTransaction(
        transaction,
        orgId,
        {
          movementDate: adjustmentDate,
          itemType: input.itemType,
          itemId: input.itemId,
          itemName: itemData.name,
          movementType: plan.movementType,
          quantity: plan.movementQuantity,
          unit: itemData.unit,
          unitCost: plan.unitCost,
          totalCost: plan.totalCost,
          balanceAfter: plan.quantityAfter,
          averageCostAfter: plan.averageCostAfter,
          sourceDocumentType: 'adjustment',
          sourceDocumentId: adjustmentRef.id,
          sourceLineId: null,
          notes,
        },
        userId,
      );

      return toAdjustment(adjustmentRef.id, document);
    });
  },
};
