import 'server-only';

import { randomUUID } from 'crypto';

import { Timestamp, type DocumentReference } from 'firebase-admin/firestore';

import { aggregateReturnedQuantitiesBySaleLineId } from '@/lib/domain/calculations/return-sale-linkage';
import { RETURN_REASON_LABELS } from '@/lib/domain/constants/return';
import { DomainError } from '@/lib/domain/errors';
import { normalizeNullableString, timestampToDate } from '@/lib/firebase/converters';
import {
  buildAuditFields,
  getFirestore,
  getOrgCollection,
} from '@/lib/repositories/base.repository';
import { inventoryRepository } from '@/lib/repositories/inventory.repository';
import type {
  ReturnEntry,
  ReturnLineItem,
  ReturnListItem,
  ReturnListParams,
  ReturnListResult,
  ReturnReason,
  ReturnStatus,
} from '@/types/return';

type ReturnLineDocument = {
  id: string;
  saleLineId: string | null;
  productId: string;
  productNameSnapshot: string;
  productCodeSnapshot: string;
  quantity: number;
  unit: string;
  sellingPriceSnapshot: number | null;
  unitCostSnapshot: number | null;
};

type ReturnDocument = {
  organizationId: string;
  returnNumber: string;
  returnDate: string;
  reason: ReturnReason;
  status: ReturnStatus;
  sourceSaleId: string | null;
  sourceSaleNumberSnapshot: string | null;
  lines: ReturnLineDocument[];
  lineCount: number;
  totalUnits: number;
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

type SaleLineDocument = {
  id: string;
  productId: string;
  productNameSnapshot: string;
  productCodeSnapshot: string;
  sellingPriceSnapshot: number;
  quantity: number;
  unit: string;
  unitCost: number;
  cogs: number;
};

type SaleDocument = {
  organizationId: string;
  status: ReturnStatus | 'draft' | 'completed';
  deletedAt: Timestamp | null;
  lines: SaleLineDocument[];
};

type SiblingReturnSnapshot = {
  id: string;
  status: ReturnStatus;
  lines: ReturnLineItem[];
};

function validateLinkedReturnQuantitiesInTransaction(
  sale: SaleDocument,
  returnId: string,
  returnData: ReturnDocument,
  siblings: SiblingReturnSnapshot[],
): ReturnLineDocument[] {
  const returnedBySaleLineId = aggregateReturnedQuantitiesBySaleLineId(
    siblings.filter((entry) => entry.id !== returnId),
    { includeDrafts: true },
  );

  const resolvedLines: ReturnLineDocument[] = [];

  for (const line of returnData.lines) {
    if (!line.saleLineId) {
      throw new DomainError('VALIDATION_ERROR', 'Sale-linked return lines must reference a sale line');
    }

    const saleLine = sale.lines.find((entry) => entry.id === line.saleLineId);

    if (!saleLine) {
      throw new DomainError('NOT_FOUND', 'One or more sale lines were not found');
    }

    if (saleLine.productId !== line.productId) {
      throw new DomainError('VALIDATION_ERROR', 'Return line product does not match the original sale line');
    }

    const remaining = saleLine.quantity - (returnedBySaleLineId.get(line.saleLineId) ?? 0);

    if (line.quantity > remaining) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Only ${remaining} ${saleLine.unit} of "${saleLine.productNameSnapshot}" remain available to return from this sale`,
      );
    }

    resolvedLines.push({
      ...line,
      sellingPriceSnapshot: saleLine.sellingPriceSnapshot,
      unitCostSnapshot: saleLine.unitCost,
      productNameSnapshot: saleLine.productNameSnapshot,
      productCodeSnapshot: saleLine.productCodeSnapshot,
      unit: saleLine.unit,
    });
  }

  return resolvedLines;
}

function toLineItem(data: ReturnLineDocument): ReturnLineItem {
  return {
    id: data.id,
    saleLineId: data.saleLineId ?? null,
    productId: data.productId,
    productNameSnapshot: data.productNameSnapshot,
    productCodeSnapshot: data.productCodeSnapshot,
    quantity: data.quantity,
    unit: data.unit,
    sellingPriceSnapshot: data.sellingPriceSnapshot ?? null,
    unitCostSnapshot: data.unitCostSnapshot ?? null,
  };
}

function toSiblingReturnSnapshot(id: string, data: ReturnDocument): SiblingReturnSnapshot {
  return {
    id,
    status: data.status,
    lines: data.lines.map(toLineItem),
  };
}

function toReturnEntry(id: string, data: ReturnDocument): ReturnEntry {
  return {
    id,
    organizationId: data.organizationId,
    returnNumber: data.returnNumber,
    returnDate: data.returnDate,
    reason: data.reason,
    status: data.status,
    sourceSaleId: data.sourceSaleId ?? null,
    sourceSaleNumberSnapshot: data.sourceSaleNumberSnapshot ?? null,
    lines: data.lines.map(toLineItem),
    lineCount: data.lineCount,
    totalUnits: data.totalUnits,
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

function toListItem(returnEntry: ReturnEntry): ReturnListItem {
  return {
    id: returnEntry.id,
    returnNumber: returnEntry.returnNumber,
    returnDate: returnEntry.returnDate,
    reason: returnEntry.reason,
    lineCount: returnEntry.lineCount,
    totalUnits: returnEntry.totalUnits,
    status: returnEntry.status,
    sourceSaleId: returnEntry.sourceSaleId,
    sourceSaleNumberSnapshot: returnEntry.sourceSaleNumberSnapshot,
    createdAt: returnEntry.createdAt,
    updatedAt: returnEntry.updatedAt,
  };
}

function matchesSearch(returnEntry: ReturnListItem, search: string): boolean {
  const term = search.trim().toLowerCase();

  if (!term) {
    return true;
  }

  const reasonLabel = RETURN_REASON_LABELS[returnEntry.reason].toLowerCase();

  return (
    returnEntry.returnNumber.toLowerCase().includes(term) ||
    returnEntry.reason.toLowerCase().includes(term) ||
    reasonLabel.includes(term)
  );
}

function assertDraftReturnInTransaction(returnData: ReturnDocument): void {
  if (returnData.deletedAt) {
    throw new DomainError('NOT_FOUND', 'Return not found');
  }

  if (returnData.status !== 'draft') {
    throw new DomainError('VALIDATION_ERROR', 'Only draft returns can be modified');
  }
}

export const returnRepository = {
  async list(orgId: string, params: ReturnListParams): Promise<ReturnListResult> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const search = params.search ?? '';

    const snapshot = await getOrgCollection(orgId, 'returns')
      .where('deletedAt', '==', null)
      .get();

    const allItems = snapshot.docs
      .map((doc) => toReturnEntry(doc.id, doc.data() as ReturnDocument))
      .map(toListItem)
      .filter((returnEntry) => matchesSearch(returnEntry, search))
      .sort((a, b) => {
        const dateCompare = b.returnDate.localeCompare(a.returnDate);

        if (dateCompare !== 0) {
          return dateCompare;
        }

        return b.returnNumber.localeCompare(a.returnNumber);
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

  /** Date-bounded completed returns for a single calendar day (YYYY-MM-DD), including lines. */
  async listCompletedByDateWithLines(orgId: string, date: string): Promise<ReturnEntry[]> {
    const snapshot = await getOrgCollection(orgId, 'returns')
      .where('deletedAt', '==', null)
      .where('status', '==', 'completed')
      .where('returnDate', '==', date)
      .get();

    return snapshot.docs.map((doc) => toReturnEntry(doc.id, doc.data() as ReturnDocument));
  },

  /** Date-bounded completed returns for a single calendar day (YYYY-MM-DD). */
  async listCompletedByDate(orgId: string, date: string): Promise<ReturnListItem[]> {
    const entries = await returnRepository.listCompletedByDateWithLines(orgId, date);
    return entries.map(toListItem);
  },

  /** Returns linked to a completed sale (for returnable-qty aggregation). */
  async listBySourceSaleId(orgId: string, sourceSaleId: string): Promise<ReturnEntry[]> {
    const snapshot = await getOrgCollection(orgId, 'returns')
      .where('deletedAt', '==', null)
      .where('sourceSaleId', '==', sourceSaleId)
      .get();

    return snapshot.docs.map((doc) => toReturnEntry(doc.id, doc.data() as ReturnDocument));
  },

  async getById(orgId: string, returnId: string): Promise<ReturnEntry | null> {
    const doc = await getOrgCollection(orgId, 'returns').doc(returnId).get();

    if (!doc.exists) {
      return null;
    }

    const returnEntry = toReturnEntry(doc.id, doc.data() as ReturnDocument);

    if (returnEntry.deletedAt) {
      return null;
    }

    return returnEntry;
  },

  async findByReturnNumber(
    orgId: string,
    returnNumber: string,
    excludeId?: string,
  ): Promise<ReturnEntry | null> {
    const normalizedNumber = returnNumber.trim().toUpperCase();
    const snapshot = await getOrgCollection(orgId, 'returns')
      .where('returnNumber', '==', normalizedNumber)
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

    return toReturnEntry(doc.id, doc.data() as ReturnDocument);
  },

  async getHighestReturnNumber(orgId: string): Promise<number> {
    const snapshot = await getOrgCollection(orgId, 'returns')
      .where('deletedAt', '==', null)
      .get();

    let highest = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data() as ReturnDocument;
      const match = /^RET-(\d+)$/i.exec(data.returnNumber);

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
      returnNumber: string;
      returnDate: string;
      reason: ReturnReason;
      sourceSaleId: string | null;
      sourceSaleNumberSnapshot: string | null;
      lines: ReturnLineItem[];
      totalUnits: number;
      notes?: string | null;
    },
    userId: string,
  ): Promise<ReturnEntry> {
    const collection = getOrgCollection(orgId, 'returns');
    const docRef = collection.doc();
    const now = Timestamp.now();

    const document: ReturnDocument = {
      organizationId: orgId,
      returnNumber: input.returnNumber.trim().toUpperCase(),
      returnDate: input.returnDate,
      reason: input.reason,
      status: 'draft',
      sourceSaleId: input.sourceSaleId,
      sourceSaleNumberSnapshot: input.sourceSaleNumberSnapshot,
      lines: input.lines.map((line) => ({
        id: line.id,
        saleLineId: line.saleLineId,
        productId: line.productId,
        productNameSnapshot: line.productNameSnapshot,
        productCodeSnapshot: line.productCodeSnapshot,
        quantity: line.quantity,
        unit: line.unit,
        sellingPriceSnapshot: line.sellingPriceSnapshot,
        unitCostSnapshot: line.unitCostSnapshot,
      })),
      lineCount: input.lines.length,
      totalUnits: input.totalUnits,
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
    return toReturnEntry(docRef.id, document);
  },

  async update(
    orgId: string,
    returnId: string,
    input: {
      returnDate?: string;
      reason?: ReturnReason;
      lines?: ReturnLineItem[];
      totalUnits?: number;
      notes?: string | null;
    },
    userId: string,
  ): Promise<ReturnEntry> {
    const firestore = getFirestore();
    const audit = buildAuditFields(userId, false);

    const updates: Partial<ReturnDocument> = {
      ...audit,
    };

    if (input.returnDate !== undefined) {
      updates.returnDate = input.returnDate;
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
        saleLineId: line.saleLineId,
        productId: line.productId,
        productNameSnapshot: line.productNameSnapshot,
        productCodeSnapshot: line.productCodeSnapshot,
        quantity: line.quantity,
        unit: line.unit,
        sellingPriceSnapshot: line.sellingPriceSnapshot,
        unitCostSnapshot: line.unitCostSnapshot,
      }));
      updates.lineCount = input.lines.length;
    }

    if (input.totalUnits !== undefined) {
      updates.totalUnits = input.totalUnits;
    }

    return firestore.runTransaction(async (transaction) => {
      const returnRef = getOrgCollection(orgId, 'returns').doc(returnId);
      const returnSnap = await transaction.get(returnRef);

      if (!returnSnap.exists) {
        throw new DomainError('NOT_FOUND', 'Return not found');
      }

      const returnData = returnSnap.data() as ReturnDocument;
      assertDraftReturnInTransaction(returnData);

      transaction.update(returnRef, updates);

      const updatedReturn: ReturnDocument = {
        ...returnData,
        ...updates,
      };

      return toReturnEntry(returnSnap.id, updatedReturn);
    });
  },

  async softDelete(orgId: string, returnId: string, userId: string): Promise<void> {
    const firestore = getFirestore();

    await firestore.runTransaction(async (transaction) => {
      const returnRef = getOrgCollection(orgId, 'returns').doc(returnId);
      const returnSnap = await transaction.get(returnRef);

      if (!returnSnap.exists) {
        throw new DomainError('NOT_FOUND', 'Return not found');
      }

      const returnData = returnSnap.data() as ReturnDocument;
      assertDraftReturnInTransaction(returnData);

      const now = Timestamp.now();

      transaction.update(returnRef, {
        deletedAt: now,
        deletedBy: userId,
        updatedAt: now,
        updatedBy: userId,
      });
    });
  },

  async complete(orgId: string, returnId: string, userId: string): Promise<ReturnEntry> {
    const firestore = getFirestore();

    return firestore.runTransaction(async (transaction) => {
      const returnRef = getOrgCollection(orgId, 'returns').doc(returnId);
      const returnSnap = await transaction.get(returnRef);

      if (!returnSnap.exists) {
        throw new DomainError('NOT_FOUND', 'Return not found');
      }

      const returnData = returnSnap.data() as ReturnDocument;

      if (returnData.deletedAt) {
        throw new DomainError('NOT_FOUND', 'Return not found');
      }

      if (returnData.status !== 'draft') {
        throw new DomainError('VALIDATION_ERROR', 'This return has already been completed');
      }

      if (returnData.lines.length === 0) {
        throw new DomainError('VALIDATION_ERROR', 'Return must have at least one product line');
      }

      const isLinkedReturn = Boolean(returnData.sourceSaleId);

      let resolvedLines = returnData.lines;

      if (isLinkedReturn) {
        const sourceSaleId = returnData.sourceSaleId;

        if (!sourceSaleId) {
          throw new DomainError('VALIDATION_ERROR', 'Sale-linked return is missing its source sale');
        }

        const saleRef = getOrgCollection(orgId, 'sales').doc(sourceSaleId);
        const saleSnap = await transaction.get(saleRef);

        if (!saleSnap.exists) {
          throw new DomainError('NOT_FOUND', 'Sale not found');
        }

        const saleData = saleSnap.data() as SaleDocument;

        if (saleData.deletedAt) {
          throw new DomainError('NOT_FOUND', 'Sale not found');
        }

        if (saleData.status !== 'completed') {
          throw new DomainError('VALIDATION_ERROR', 'Returns can only be recorded against completed sales');
        }

        if (saleData.organizationId !== orgId) {
          throw new DomainError('NOT_FOUND', 'Sale not found');
        }

        const siblingsQuery = getOrgCollection(orgId, 'returns')
          .where('deletedAt', '==', null)
          .where('sourceSaleId', '==', sourceSaleId);
        const siblingsSnap = await transaction.get(siblingsQuery);
        const siblings = siblingsSnap.docs.map((doc) =>
          toSiblingReturnSnapshot(doc.id, doc.data() as ReturnDocument),
        );

        resolvedLines = validateLinkedReturnQuantitiesInTransaction(
          saleData,
          returnId,
          returnData,
          siblings,
        );
      }

      const uniqueProductIds = [...new Set(resolvedLines.map((line) => line.productId))];
      const productRefs = new Map<string, DocumentReference>();
      const initialProductState = new Map<string, { currentStock: number; averageCost: number }>();
      const runningProductState = new Map<string, { qty: number; avgCost: number }>();

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

        if (!isLinkedReturn && !productData.isActive) {
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

      for (const line of resolvedLines) {
        const state = runningProductState.get(line.productId);

        if (!state) {
          throw new DomainError('NOT_FOUND', 'One or more products were not found');
        }

        const newQty = state.qty + line.quantity;
        const unitCost = isLinkedReturn
          ? (line.unitCostSnapshot ?? state.avgCost)
          : state.avgCost;
        const totalCost = Math.round(line.quantity * unitCost);

        runningProductState.set(line.productId, {
          qty: newQty,
          avgCost: state.avgCost,
        });

        inventoryRepository.createMovementInTransaction(
          transaction,
          orgId,
          {
            movementDate: returnData.returnDate,
            itemType: 'finished_product',
            itemId: line.productId,
            itemName: line.productNameSnapshot,
            movementType: 'RETURN_IN',
            quantity: line.quantity,
            unit: line.unit,
            unitCost,
            totalCost,
            balanceAfter: newQty,
            averageCostAfter: state.avgCost,
            sourceDocumentType: 'return',
            sourceDocumentId: returnId,
            sourceLineId: line.id,
          },
          userId,
        );
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

      transaction.update(returnRef, {
        status: 'completed',
        lines: resolvedLines,
        completedAt: now,
        completedBy: userId,
        updatedAt: now,
        updatedBy: userId,
      });

      const updatedReturn: ReturnDocument = {
        ...returnData,
        status: 'completed',
        lines: resolvedLines,
        completedAt: now,
        completedBy: userId,
        updatedAt: now,
        updatedBy: userId,
      };

      return toReturnEntry(returnSnap.id, updatedReturn);
    });
  },
};

export function generateReturnLineId(): string {
  return randomUUID();
}
