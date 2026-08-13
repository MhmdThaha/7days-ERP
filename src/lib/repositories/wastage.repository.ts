import 'server-only';

import { randomUUID } from 'crypto';

import { Timestamp, type DocumentReference } from 'firebase-admin/firestore';

import { WASTAGE_REASON_LABELS } from '@/lib/domain/constants/wastage';
import { DomainError } from '@/lib/domain/errors';
import { normalizeNullableString, timestampToDate } from '@/lib/firebase/converters';
import {
  buildAuditFields,
  getFirestore,
  getOrgCollection,
} from '@/lib/repositories/base.repository';
import { inventoryRepository } from '@/lib/repositories/inventory.repository';
import type {
  Wastage,
  WastageLineItem,
  WastageListItem,
  WastageListParams,
  WastageListResult,
  WastageReason,
  WastageStatus,
} from '@/types/wastage';

type WastageLineDocument = {
  id: string;
  productId: string;
  productNameSnapshot: string;
  productCodeSnapshot: string;
  quantity: number;
  unit: string;
  unitCost?: number;
  estimatedCost?: number;
};

type WastageDocument = {
  organizationId: string;
  wastageNumber: string;
  wastageDate: string;
  reason: WastageReason;
  status: WastageStatus;
  lines: WastageLineDocument[];
  lineCount: number;
  totalUnits: number;
  totalWastageCost?: number;
  notes: string | null;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  completedAt: Timestamp | null;
  completedBy: string | null;
  deletedAt: Timestamp | null;
  deletedBy: string | null;
};

type ProductDocument = {
  deletedAt: Timestamp | null;
  isActive: boolean;
  currentStock: number;
  averageCost: number;
  unit: string;
};

function toLineItem(data: WastageLineDocument): WastageLineItem {
  return {
    id: data.id,
    productId: data.productId,
    productNameSnapshot: data.productNameSnapshot,
    productCodeSnapshot: data.productCodeSnapshot,
    quantity: data.quantity,
    unit: data.unit,
    unitCost: data.unitCost ?? 0,
    estimatedCost: data.estimatedCost ?? 0,
  };
}

function toWastage(id: string, data: WastageDocument): Wastage {
  return {
    id,
    organizationId: data.organizationId,
    wastageNumber: data.wastageNumber,
    wastageDate: data.wastageDate,
    reason: data.reason,
    status: data.status,
    lines: data.lines.map(toLineItem),
    lineCount: data.lineCount,
    totalUnits: data.totalUnits,
    totalWastageCost: data.totalWastageCost ?? 0,
    notes: data.notes,
    createdAt: timestampToDate(data.createdAt) ?? new Date(),
    createdBy: data.createdBy,
    updatedAt: timestampToDate(data.updatedAt) ?? new Date(),
    updatedBy: data.updatedBy,
    completedAt: timestampToDate(data.completedAt),
    completedBy: data.completedBy ?? null,
    deletedAt: timestampToDate(data.deletedAt),
    deletedBy: data.deletedBy,
  };
}

function toListItem(wastage: Wastage): WastageListItem {
  return {
    id: wastage.id,
    wastageNumber: wastage.wastageNumber,
    wastageDate: wastage.wastageDate,
    reason: wastage.reason,
    lineCount: wastage.lineCount,
    totalUnits: wastage.totalUnits,
    totalWastageCost: wastage.totalWastageCost,
    status: wastage.status,
    createdAt: wastage.createdAt,
    updatedAt: wastage.updatedAt,
  };
}

function matchesSearch(wastage: WastageListItem, search: string): boolean {
  const term = search.trim().toLowerCase();

  if (!term) {
    return true;
  }

  const reasonLabel = WASTAGE_REASON_LABELS[wastage.reason].toLowerCase();

  return (
    wastage.wastageNumber.toLowerCase().includes(term) ||
    wastage.reason.toLowerCase().includes(term) ||
    reasonLabel.includes(term)
  );
}

function assertDraftWastageInTransaction(wastageData: WastageDocument): void {
  if (wastageData.deletedAt) {
    throw new DomainError('NOT_FOUND', 'Wastage entry not found');
  }

  if (wastageData.status !== 'draft') {
    throw new DomainError('VALIDATION_ERROR', 'Only draft wastage entries can be modified');
  }
}

export const wastageRepository = {
  async list(orgId: string, params: WastageListParams): Promise<WastageListResult> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const search = params.search ?? '';

    const snapshot = await getOrgCollection(orgId, 'wastage')
      .where('deletedAt', '==', null)
      .get();

    const allItems = snapshot.docs
      .map((doc) => toWastage(doc.id, doc.data() as WastageDocument))
      .map(toListItem)
      .filter((wastage) => matchesSearch(wastage, search))
      .sort((a, b) => {
        const dateCompare = b.wastageDate.localeCompare(a.wastageDate);

        if (dateCompare !== 0) {
          return dateCompare;
        }

        return b.wastageNumber.localeCompare(a.wastageNumber);
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

  async listCompletedByDate(orgId: string, date: string): Promise<WastageListItem[]> {
    const snapshot = await getOrgCollection(orgId, 'wastage')
      .where('deletedAt', '==', null)
      .where('status', '==', 'completed')
      .where('wastageDate', '==', date)
      .get();

    return snapshot.docs
      .map((doc) => toWastage(doc.id, doc.data() as WastageDocument))
      .map(toListItem);
  },

  async getById(orgId: string, wastageId: string): Promise<Wastage | null> {
    const doc = await getOrgCollection(orgId, 'wastage').doc(wastageId).get();

    if (!doc.exists) {
      return null;
    }

    const wastage = toWastage(doc.id, doc.data() as WastageDocument);

    if (wastage.deletedAt) {
      return null;
    }

    return wastage;
  },

  async findByWastageNumber(
    orgId: string,
    wastageNumber: string,
    excludeId?: string,
  ): Promise<Wastage | null> {
    const normalizedNumber = wastageNumber.trim().toUpperCase();
    const snapshot = await getOrgCollection(orgId, 'wastage')
      .where('wastageNumber', '==', normalizedNumber)
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

    return toWastage(doc.id, doc.data() as WastageDocument);
  },

  async getHighestWastageNumber(orgId: string): Promise<number> {
    const snapshot = await getOrgCollection(orgId, 'wastage')
      .where('deletedAt', '==', null)
      .get();

    let highest = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data() as WastageDocument;
      const match = /^WST-(\d+)$/i.exec(data.wastageNumber);

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
      wastageNumber: string;
      wastageDate: string;
      reason: WastageReason;
      lines: WastageLineItem[];
      totalUnits: number;
      notes?: string | null;
    },
    userId: string,
  ): Promise<Wastage> {
    const collection = getOrgCollection(orgId, 'wastage');
    const docRef = collection.doc();
    const now = Timestamp.now();

    const document: WastageDocument = {
      organizationId: orgId,
      wastageNumber: input.wastageNumber.trim().toUpperCase(),
      wastageDate: input.wastageDate,
      reason: input.reason,
      status: 'draft',
      lines: input.lines.map((line) => ({
        id: line.id,
        productId: line.productId,
        productNameSnapshot: line.productNameSnapshot,
        productCodeSnapshot: line.productCodeSnapshot,
        quantity: line.quantity,
        unit: line.unit,
      })),
      lineCount: input.lines.length,
      totalUnits: input.totalUnits,
      totalWastageCost: 0,
      notes: normalizeNullableString(input.notes),
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
    return toWastage(docRef.id, document);
  },

  async update(
    orgId: string,
    wastageId: string,
    input: {
      wastageDate?: string;
      reason?: WastageReason;
      lines?: WastageLineItem[];
      totalUnits?: number;
      notes?: string | null;
    },
    userId: string,
  ): Promise<Wastage> {
    const firestore = getFirestore();
    const audit = buildAuditFields(userId, false);

    const updates: Partial<WastageDocument> = {
      ...audit,
    };

    if (input.wastageDate !== undefined) {
      updates.wastageDate = input.wastageDate;
    }

    if (input.reason !== undefined) {
      updates.reason = input.reason;
    }

    if (input.notes !== undefined) {
      updates.notes = normalizeNullableString(input.notes);
    }

    if (input.lines !== undefined) {
      updates.lines = input.lines.map((line) => ({
        id: line.id,
        productId: line.productId,
        productNameSnapshot: line.productNameSnapshot,
        productCodeSnapshot: line.productCodeSnapshot,
        quantity: line.quantity,
        unit: line.unit,
      }));
      updates.lineCount = input.lines.length;
    }

    if (input.totalUnits !== undefined) {
      updates.totalUnits = input.totalUnits;
    }

    return firestore.runTransaction(async (transaction) => {
      const wastageRef = getOrgCollection(orgId, 'wastage').doc(wastageId);
      const wastageSnap = await transaction.get(wastageRef);

      if (!wastageSnap.exists) {
        throw new DomainError('NOT_FOUND', 'Wastage entry not found');
      }

      const wastageData = wastageSnap.data() as WastageDocument;
      assertDraftWastageInTransaction(wastageData);

      transaction.update(wastageRef, updates);

      const updatedWastage: WastageDocument = {
        ...wastageData,
        ...updates,
      };

      return toWastage(wastageSnap.id, updatedWastage);
    });
  },

  async softDelete(orgId: string, wastageId: string, userId: string): Promise<void> {
    const firestore = getFirestore();

    await firestore.runTransaction(async (transaction) => {
      const wastageRef = getOrgCollection(orgId, 'wastage').doc(wastageId);
      const wastageSnap = await transaction.get(wastageRef);

      if (!wastageSnap.exists) {
        throw new DomainError('NOT_FOUND', 'Wastage entry not found');
      }

      const wastageData = wastageSnap.data() as WastageDocument;
      assertDraftWastageInTransaction(wastageData);

      const now = Timestamp.now();

      transaction.update(wastageRef, {
        deletedAt: now,
        deletedBy: userId,
        updatedAt: now,
        updatedBy: userId,
      });
    });
  },

  async complete(orgId: string, wastageId: string, userId: string): Promise<Wastage> {
    const firestore = getFirestore();

    return firestore.runTransaction(async (transaction) => {
      const wastageRef = getOrgCollection(orgId, 'wastage').doc(wastageId);
      const wastageSnap = await transaction.get(wastageRef);

      if (!wastageSnap.exists) {
        throw new DomainError('NOT_FOUND', 'Wastage entry not found');
      }

      const wastageData = wastageSnap.data() as WastageDocument;

      if (wastageData.deletedAt) {
        throw new DomainError('NOT_FOUND', 'Wastage entry not found');
      }

      if (wastageData.status !== 'draft') {
        throw new DomainError('VALIDATION_ERROR', 'This wastage entry has already been completed');
      }

      if (wastageData.lines.length === 0) {
        throw new DomainError('VALIDATION_ERROR', 'Wastage must have at least one product line');
      }

      const uniqueProductIds = [...new Set(wastageData.lines.map((line) => line.productId))];
      const productRefs = new Map<string, DocumentReference>();
      const initialProductState = new Map<string, { currentStock: number; averageCost: number }>();
      const runningProductState = new Map<string, { qty: number; avgCost: number }>();
      const completedLines: WastageLineDocument[] = [];
      let totalWastageCost = 0;

      for (const productId of uniqueProductIds) {
        const productRef = getOrgCollection(orgId, 'products').doc(productId);
        const productSnap = await transaction.get(productRef);

        if (!productSnap.exists) {
          throw new DomainError('NOT_FOUND', 'One or more products were not found');
        }

        const productData = productSnap.data() as ProductDocument;

        if (productData.deletedAt) {
          throw new DomainError('NOT_FOUND', 'One or more products were not found');
        }

        if (!productData.isActive) {
          throw new DomainError('VALIDATION_ERROR', 'One or more products are inactive');
        }

        productRefs.set(productId, productRef);
        initialProductState.set(productId, {
          currentStock: productData.currentStock ?? 0,
          averageCost: productData.averageCost ?? 0,
        });
        runningProductState.set(productId, {
          qty: productData.currentStock ?? 0,
          avgCost: productData.averageCost ?? 0,
        });
      }

      for (const line of wastageData.lines) {
        const state = runningProductState.get(line.productId);

        if (!state) {
          throw new DomainError('NOT_FOUND', 'One or more products were not found');
        }

        const newQty = state.qty - line.quantity;

        if (newQty < 0) {
          throw new DomainError(
            'VALIDATION_ERROR',
            `Insufficient stock for "${line.productNameSnapshot}". Available: ${state.qty}, required: ${line.quantity}`,
          );
        }

        const unitCost = state.avgCost;
        const estimatedCost = Math.round(line.quantity * unitCost);

        runningProductState.set(line.productId, {
          qty: newQty,
          avgCost: state.avgCost,
        });

        inventoryRepository.createMovementInTransaction(
          transaction,
          orgId,
          {
            movementDate: wastageData.wastageDate,
            itemType: 'finished_product',
            itemId: line.productId,
            itemName: line.productNameSnapshot,
            movementType: 'WASTAGE_OUT',
            quantity: line.quantity,
            unit: line.unit,
            unitCost,
            totalCost: estimatedCost,
            balanceAfter: newQty,
            averageCostAfter: state.avgCost,
            sourceDocumentType: 'wastage',
            sourceDocumentId: wastageId,
            sourceLineId: line.id,
          },
          userId,
        );

        completedLines.push({
          ...line,
          unitCost,
          estimatedCost,
        });
        totalWastageCost += estimatedCost;
      }

      const audit = buildAuditFields(userId, false);

      for (const productId of uniqueProductIds) {
        const initial = initialProductState.get(productId);
        const finalState = runningProductState.get(productId);
        const productRef = productRefs.get(productId);

        if (!initial || !finalState || !productRef) {
          continue;
        }

        if (finalState.qty !== initial.currentStock) {
          transaction.update(productRef, {
            currentStock: finalState.qty,
            ...audit,
          });
        }
      }

      const now = Timestamp.now();

      transaction.update(wastageRef, {
        status: 'completed',
        lines: completedLines,
        totalWastageCost,
        completedAt: now,
        completedBy: userId,
        updatedAt: now,
        updatedBy: userId,
      });

      const updatedWastage: WastageDocument = {
        ...wastageData,
        status: 'completed',
        lines: completedLines,
        totalWastageCost,
        completedAt: now,
        completedBy: userId,
        updatedAt: now,
        updatedBy: userId,
      };

      return toWastage(wastageSnap.id, updatedWastage);
    });
  },
};

export function generateWastageLineId(): string {
  return randomUUID();
}
