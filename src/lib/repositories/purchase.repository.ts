import 'server-only';

import { randomUUID } from 'crypto';

import { Timestamp, type DocumentReference } from 'firebase-admin/firestore';

import { normalizeNullableString, timestampToDate } from '@/lib/firebase/converters';
import { buildAuditFields, getFirestore, getOrgCollection } from '@/lib/repositories/base.repository';
import { reserveUniqueNumberInTransaction } from '@/lib/repositories/unique-number.repository';
import { inventoryRepository } from '@/lib/repositories/inventory.repository';
import { calculateNewWac } from '@/lib/domain/calculations/wac';
import { DomainError } from '@/lib/domain/errors';
import type {
  PaymentStatus,
  Purchase,
  PurchaseLineItem,
  PurchaseListItem,
  PurchaseListParams,
  PurchaseListResult,
  PurchaseStatus,
  PurchaseStatusFilter,
} from '@/types/purchase';

type PurchaseLineItemDocument = {
  id: string;
  rawMaterialId: string;
  rawMaterialCode: string;
  rawMaterialName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  lineTotal: number;
};

type PurchaseDocument = {
  organizationId: string;
  purchaseNumber: string;
  purchaseDate: string;
  supplierName: string;
  invoiceNumber: string | null;
  status: PurchaseStatus;
  paymentStatus: PaymentStatus;
  lineItems: PurchaseLineItemDocument[];
  totalAmount: number;
  lineItemCount: number;
  notes: string | null;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  receivedAt: Timestamp | null;
  receivedBy: string | null;
  deletedAt: Timestamp | null;
  deletedBy: string | null;
};

function toLineItem(data: PurchaseLineItemDocument): PurchaseLineItem {
  return {
    id: data.id,
    rawMaterialId: data.rawMaterialId,
    rawMaterialCode: data.rawMaterialCode,
    rawMaterialName: data.rawMaterialName,
    quantity: data.quantity,
    unit: data.unit,
    unitCost: data.unitCost,
    lineTotal: data.lineTotal,
  };
}

function toPurchase(id: string, data: PurchaseDocument): Purchase {
  return {
    id,
    organizationId: data.organizationId,
    purchaseNumber: data.purchaseNumber,
    purchaseDate: data.purchaseDate,
    supplierName: data.supplierName,
    invoiceNumber: data.invoiceNumber,
    status: data.status,
    paymentStatus: data.paymentStatus,
    lineItems: data.lineItems.map(toLineItem),
    totalAmount: data.totalAmount,
    lineItemCount: data.lineItemCount,
    notes: data.notes,
    createdAt: timestampToDate(data.createdAt) ?? new Date(),
    createdBy: data.createdBy,
    updatedAt: timestampToDate(data.updatedAt) ?? new Date(),
    updatedBy: data.updatedBy,
    receivedAt: timestampToDate(data.receivedAt ?? null),
    receivedBy: data.receivedBy ?? null,
    deletedAt: timestampToDate(data.deletedAt),
    deletedBy: data.deletedBy,
  };
}

function toListItem(purchase: Purchase): PurchaseListItem {
  return {
    id: purchase.id,
    purchaseNumber: purchase.purchaseNumber,
    purchaseDate: purchase.purchaseDate,
    supplierName: purchase.supplierName,
    invoiceNumber: purchase.invoiceNumber,
    paymentStatus: purchase.paymentStatus,
    lineItemCount: purchase.lineItemCount,
    totalAmount: purchase.totalAmount,
    status: purchase.status,
    createdAt: purchase.createdAt,
    updatedAt: purchase.updatedAt,
  };
}

function matchesSearch(purchase: PurchaseListItem, search: string): boolean {
  const term = search.trim().toLowerCase();

  if (!term) {
    return true;
  }

  return (
    purchase.purchaseNumber.toLowerCase().includes(term) ||
    purchase.supplierName.toLowerCase().includes(term) ||
    (purchase.invoiceNumber?.toLowerCase().includes(term) ?? false)
  );
}

function matchesStatus(purchase: PurchaseListItem, status: PurchaseStatusFilter | undefined): boolean {
  if (!status || status === 'all') {
    return true;
  }

  return purchase.status === status;
}

function assertDraftPurchaseInTransaction(purchaseData: PurchaseDocument): void {
  if (purchaseData.deletedAt) {
    throw new DomainError('NOT_FOUND', 'Purchase not found');
  }

  if (purchaseData.status !== 'draft') {
    throw new DomainError('VALIDATION_ERROR', 'Only draft purchases can be modified');
  }
}

export const purchaseRepository = {
  async list(orgId: string, params: PurchaseListParams): Promise<PurchaseListResult> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const search = params.search ?? '';

    const snapshot = await getOrgCollection(orgId, 'purchases')
      .where('deletedAt', '==', null)
      .get();

    const allItems = snapshot.docs
      .map((doc) => toPurchase(doc.id, doc.data() as PurchaseDocument))
      .map(toListItem)
      .filter((purchase) => matchesSearch(purchase, search))
      .filter((purchase) => matchesStatus(purchase, params.status))
      .sort((a, b) => {
        const dateCompare = b.purchaseDate.localeCompare(a.purchaseDate);

        if (dateCompare !== 0) {
          return dateCompare;
        }

        return b.purchaseNumber.localeCompare(a.purchaseNumber);
      });

    const total = allItems.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;

    return {
      items: allItems.slice(start, start + pageSize),
      total,
      page: safePage,
      pageSize,
      totalPages,
    };
  },

  async getById(orgId: string, purchaseId: string): Promise<Purchase | null> {
    const doc = await getOrgCollection(orgId, 'purchases').doc(purchaseId).get();

    if (!doc.exists) {
      return null;
    }

    const purchase = toPurchase(doc.id, doc.data() as PurchaseDocument);

    if (purchase.deletedAt) {
      return null;
    }

    return purchase;
  },

  async findByPurchaseNumber(
    orgId: string,
    purchaseNumber: string,
    excludeId?: string,
  ): Promise<Purchase | null> {
    const normalizedNumber = purchaseNumber.trim().toUpperCase();
    const snapshot = await getOrgCollection(orgId, 'purchases')
      .where('purchaseNumber', '==', normalizedNumber)
      .where('deletedAt', '==', null)
      .limit(1)
      .get();

    const doc = snapshot.docs[0];

    if (!doc) {
      return null;
    }

    if (excludeId && doc.id === excludeId) {
      return null;
    }

    return toPurchase(doc.id, doc.data() as PurchaseDocument);
  },

  async getHighestPurchaseNumber(orgId: string): Promise<number> {
    const snapshot = await getOrgCollection(orgId, 'purchases')
      .where('deletedAt', '==', null)
      .get();

    let highest = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data() as PurchaseDocument;
      const match = /^PUR-(\d+)$/i.exec(data.purchaseNumber);

      if (match?.[1]) {
        const value = Number.parseInt(match[1], 10);

        if (!Number.isNaN(value) && value > highest) {
          highest = value;
        }
      }
    }

    return highest;
  },

  async create(
    orgId: string,
    input: {
      purchaseNumber: string;
      purchaseDate: string;
      supplierName: string;
      invoiceNumber?: string | null;
      paymentStatus: PaymentStatus;
      lineItems: PurchaseLineItem[];
      totalAmount: number;
      notes?: string | null;
    },
    userId: string,
  ): Promise<Purchase> {
    const firestore = getFirestore();
    const collection = getOrgCollection(orgId, 'purchases');
    const docRef = collection.doc();
    const normalizedPurchaseNumber = input.purchaseNumber.trim().toUpperCase();

    return firestore.runTransaction(async (transaction) => {
      await reserveUniqueNumberInTransaction(
        transaction,
        orgId,
        'purchase',
        normalizedPurchaseNumber,
        docRef.id,
      );

      const now = Timestamp.now();

      const document: PurchaseDocument = {
        organizationId: orgId,
        purchaseNumber: normalizedPurchaseNumber,
        purchaseDate: input.purchaseDate,
        supplierName: input.supplierName.trim(),
        invoiceNumber: normalizeNullableString(input.invoiceNumber),
        status: 'draft',
        paymentStatus: input.paymentStatus,
        lineItems: input.lineItems.map((lineItem) => ({
          id: lineItem.id,
          rawMaterialId: lineItem.rawMaterialId,
          rawMaterialCode: lineItem.rawMaterialCode,
          rawMaterialName: lineItem.rawMaterialName,
          quantity: lineItem.quantity,
          unit: lineItem.unit,
          unitCost: lineItem.unitCost,
          lineTotal: lineItem.lineTotal,
        })),
        totalAmount: input.totalAmount,
        lineItemCount: input.lineItems.length,
        notes: normalizeNullableString(input.notes),
        createdAt: now,
        createdBy: userId,
        updatedAt: now,
        updatedBy: userId,
        receivedAt: null,
        receivedBy: null,
        deletedAt: null,
        deletedBy: null,
      };

      transaction.set(docRef, document);
      return toPurchase(docRef.id, document);
    });
  },

  async update(
    orgId: string,
    purchaseId: string,
    input: {
      purchaseDate?: string;
      supplierName?: string;
      invoiceNumber?: string | null;
      paymentStatus?: PaymentStatus;
      lineItems?: PurchaseLineItem[];
      totalAmount?: number;
      notes?: string | null;
    },
    userId: string,
  ): Promise<Purchase> {
    const firestore = getFirestore();
    const audit = buildAuditFields(userId, false);

    const updates: Partial<PurchaseDocument> = {
      ...audit,
    };

    if (input.purchaseDate !== undefined) {
      updates.purchaseDate = input.purchaseDate;
    }

    if (input.supplierName !== undefined) {
      updates.supplierName = input.supplierName.trim();
    }

    if (input.invoiceNumber !== undefined) {
      updates.invoiceNumber = normalizeNullableString(input.invoiceNumber);
    }

    if (input.paymentStatus !== undefined) {
      updates.paymentStatus = input.paymentStatus;
    }

    if (input.notes !== undefined) {
      updates.notes = normalizeNullableString(input.notes);
    }

    if (input.lineItems !== undefined) {
      updates.lineItems = input.lineItems.map((lineItem) => ({
        id: lineItem.id,
        rawMaterialId: lineItem.rawMaterialId,
        rawMaterialCode: lineItem.rawMaterialCode,
        rawMaterialName: lineItem.rawMaterialName,
        quantity: lineItem.quantity,
        unit: lineItem.unit,
        unitCost: lineItem.unitCost,
        lineTotal: lineItem.lineTotal,
      }));
      updates.lineItemCount = input.lineItems.length;
    }

    if (input.totalAmount !== undefined) {
      updates.totalAmount = input.totalAmount;
    }

    return firestore.runTransaction(async (transaction) => {
      const purchaseRef = getOrgCollection(orgId, 'purchases').doc(purchaseId);
      const purchaseSnap = await transaction.get(purchaseRef);

      if (!purchaseSnap.exists) {
        throw new DomainError('NOT_FOUND', 'Purchase not found');
      }

      const purchaseData = purchaseSnap.data() as PurchaseDocument;
      assertDraftPurchaseInTransaction(purchaseData);

      transaction.update(purchaseRef, updates);

      const updatedPurchase: PurchaseDocument = {
        ...purchaseData,
        ...updates,
      };

      return toPurchase(purchaseSnap.id, updatedPurchase);
    });
  },

  async softDelete(orgId: string, purchaseId: string, userId: string): Promise<void> {
    const firestore = getFirestore();

    await firestore.runTransaction(async (transaction) => {
      const purchaseRef = getOrgCollection(orgId, 'purchases').doc(purchaseId);
      const purchaseSnap = await transaction.get(purchaseRef);

      if (!purchaseSnap.exists) {
        throw new DomainError('NOT_FOUND', 'Purchase not found');
      }

      const purchaseData = purchaseSnap.data() as PurchaseDocument;
      assertDraftPurchaseInTransaction(purchaseData);

      const now = Timestamp.now();

      transaction.update(purchaseRef, {
        deletedAt: now,
        deletedBy: userId,
        updatedAt: now,
        updatedBy: userId,
      });
    });
  },

  async receive(orgId: string, purchaseId: string, userId: string): Promise<Purchase> {
    const firestore = getFirestore();

    return firestore.runTransaction(async (transaction) => {
      const purchaseRef = getOrgCollection(orgId, 'purchases').doc(purchaseId);
      const purchaseSnap = await transaction.get(purchaseRef);

      if (!purchaseSnap.exists) {
        throw new DomainError('NOT_FOUND', 'Purchase not found');
      }

      const purchaseData = purchaseSnap.data() as PurchaseDocument;

      if (purchaseData.deletedAt) {
        throw new DomainError('NOT_FOUND', 'Purchase not found');
      }

      if (purchaseData.status !== 'draft') {
        throw new DomainError('VALIDATION_ERROR', 'This purchase has already been received');
      }

      if (purchaseData.lineItems.length === 0) {
        throw new DomainError('VALIDATION_ERROR', 'Purchase must have at least one line item');
      }

      const uniqueMaterialIds = [
        ...new Set(purchaseData.lineItems.map((lineItem) => lineItem.rawMaterialId)),
      ];

      const materialRefs = new Map<string, DocumentReference>();
      const initialMaterialState = new Map<string, { currentStock: number; averageCost: number }>();
      const runningMaterialState = new Map<string, { qty: number; avgCost: number }>();

      for (const rawMaterialId of uniqueMaterialIds) {
        const rawMaterialRef = getOrgCollection(orgId, 'rawMaterials').doc(rawMaterialId);
        const rawMaterialSnap = await transaction.get(rawMaterialRef);

        if (!rawMaterialSnap.exists) {
          throw new DomainError('NOT_FOUND', 'One or more raw materials were not found');
        }

        const rawMaterialData = rawMaterialSnap.data() as {
          deletedAt: Timestamp | null;
          isActive: boolean;
          currentStock: number;
          averageCost: number;
        };

        if (rawMaterialData.deletedAt) {
          throw new DomainError('NOT_FOUND', 'One or more raw materials were not found');
        }

        if (!rawMaterialData.isActive) {
          throw new DomainError('VALIDATION_ERROR', 'One or more raw materials are inactive');
        }

        materialRefs.set(rawMaterialId, rawMaterialRef);
        initialMaterialState.set(rawMaterialId, {
          currentStock: rawMaterialData.currentStock ?? 0,
          averageCost: rawMaterialData.averageCost ?? 0,
        });
        runningMaterialState.set(rawMaterialId, {
          qty: rawMaterialData.currentStock ?? 0,
          avgCost: rawMaterialData.averageCost ?? 0,
        });
      }

      for (const lineItem of purchaseData.lineItems) {
        const state = runningMaterialState.get(lineItem.rawMaterialId);

        if (!state) {
          throw new DomainError('NOT_FOUND', 'One or more raw materials were not found');
        }

        const { newQty, newAvgCost } = calculateNewWac(
          state.qty,
          state.avgCost,
          lineItem.quantity,
          lineItem.unitCost,
        );

        runningMaterialState.set(lineItem.rawMaterialId, { qty: newQty, avgCost: newAvgCost });

        inventoryRepository.createMovementInTransaction(
          transaction,
          orgId,
          {
            movementDate: purchaseData.purchaseDate,
            itemType: 'raw_material',
            itemId: lineItem.rawMaterialId,
            itemName: lineItem.rawMaterialName,
            movementType: 'PURCHASE_IN',
            quantity: lineItem.quantity,
            unit: lineItem.unit,
            unitCost: lineItem.unitCost,
            totalCost: lineItem.lineTotal,
            balanceAfter: newQty,
            averageCostAfter: newAvgCost,
            sourceDocumentType: 'purchase',
            sourceDocumentId: purchaseId,
            sourceLineId: lineItem.id,
          },
          userId,
        );
      }

      const audit = buildAuditFields(userId, false);

      for (const rawMaterialId of uniqueMaterialIds) {
        const initial = initialMaterialState.get(rawMaterialId);
        const finalState = runningMaterialState.get(rawMaterialId);
        const rawMaterialRef = materialRefs.get(rawMaterialId);

        if (!initial || !finalState || !rawMaterialRef) {
          continue;
        }

        if (
          finalState.qty !== initial.currentStock ||
          finalState.avgCost !== initial.averageCost
        ) {
          transaction.update(rawMaterialRef, {
            currentStock: finalState.qty,
            averageCost: finalState.avgCost,
            ...audit,
          });
        }
      }

      const now = Timestamp.now();

      transaction.update(purchaseRef, {
        status: 'received',
        receivedAt: now,
        receivedBy: userId,
        updatedAt: now,
        updatedBy: userId,
      });

      const updatedPurchase: PurchaseDocument = {
        ...purchaseData,
        status: 'received',
        receivedAt: now,
        receivedBy: userId,
        updatedAt: now,
        updatedBy: userId,
      };

      return toPurchase(purchaseSnap.id, updatedPurchase);
    });
  },
};

export function generateLineItemId(): string {
  return randomUUID();
}
