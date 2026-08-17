import 'server-only';

import { randomUUID } from 'crypto';

import { Timestamp, type DocumentReference, type Query, type QueryDocumentSnapshot } from 'firebase-admin/firestore';

import { DomainError } from '@/lib/domain/errors';
import {
  findNextFreeSaleSequence,
  parseSaleNumberSequence,
} from '@/lib/domain/sale-number';
import { normalizeNullableString, timestampToDate } from '@/lib/firebase/converters';
import {
  buildAuditFields,
  getFirestore,
  getOrgCollection,
} from '@/lib/repositories/base.repository';
import { reserveUniqueNumberInTransaction } from '@/lib/repositories/unique-number.repository';
import { importHistoryRepository } from '@/lib/repositories/import-history.repository';
import { inventoryRepository } from '@/lib/repositories/inventory.repository';
import type {
  Sale,
  SaleLineItem,
  SaleListItem,
  SaleListPageParams,
  SaleListPageResult,
  SaleListParams,
  SaleListResult,
  SalePageCursor,
  SaleStatus,
  SaleStatusFilter,
} from '@/types/sale';

type SaleLineDocument = {
  id: string;
  productId: string;
  productNameSnapshot: string;
  productCodeSnapshot: string;
  sellingPriceSnapshot: number;
  quantity: number;
  unit: string;
  lineTotal: number;
  unitCost?: number;
  cogs?: number;
};

type SaleDocument = {
  organizationId: string;
  saleNumber: string;
  saleDate: string;
  customerId: string | null;
  customerNameSnapshot: string | null;
  status: SaleStatus;
  lines: SaleLineDocument[];
  subtotal: number;
  totalCogs?: number;
  lineCount: number;
  notes: string | null;
  importId?: string | null;
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

function toLineItem(data: SaleLineDocument): SaleLineItem {
  return {
    id: data.id,
    productId: data.productId,
    productNameSnapshot: data.productNameSnapshot,
    productCodeSnapshot: data.productCodeSnapshot,
    sellingPriceSnapshot: data.sellingPriceSnapshot,
    quantity: data.quantity,
    unit: data.unit,
    lineTotal: data.lineTotal,
    unitCost: data.unitCost ?? 0,
    cogs: data.cogs ?? 0,
  };
}

function toSale(id: string, data: SaleDocument): Sale {
  return {
    id,
    organizationId: data.organizationId,
    saleNumber: data.saleNumber,
    saleDate: data.saleDate,
    customerId: data.customerId ?? null,
    customerNameSnapshot: data.customerNameSnapshot ?? null,
    status: data.status,
    lines: data.lines.map(toLineItem),
    subtotal: data.subtotal,
    totalCogs: data.totalCogs ?? 0,
    lineCount: data.lineCount,
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

function toListItem(sale: Sale): SaleListItem {
  return {
    id: sale.id,
    saleNumber: sale.saleNumber,
    saleDate: sale.saleDate,
    customerNameSnapshot: sale.customerNameSnapshot,
    lineCount: sale.lineCount,
    subtotal: sale.subtotal,
    totalCogs: sale.totalCogs,
    status: sale.status,
    createdAt: sale.createdAt,
    updatedAt: sale.updatedAt,
  };
}

function matchesSearch(sale: SaleListItem, search: string): boolean {
  const term = search.trim().toLowerCase();

  if (!term) {
    return true;
  }

  return (
    sale.saleNumber.toLowerCase().includes(term) ||
    (sale.customerNameSnapshot?.toLowerCase().includes(term) ?? false)
  );
}

function matchesStatus(sale: SaleListItem, status: SaleStatusFilter | undefined): boolean {
  if (!status || status === 'all') {
    return true;
  }

  return sale.status === status;
}

function toPageCursor(sale: SaleListItem): SalePageCursor {
  return {
    saleDate: sale.saleDate,
    saleNumber: sale.saleNumber,
  };
}

function buildSalesListBaseQuery(orgId: string, status: SaleStatusFilter | undefined): Query {
  let query: Query = getOrgCollection(orgId, 'sales').where('deletedAt', '==', null);

  if (status && status !== 'all') {
    query = query.where('status', '==', status);
  }

  return query;
}

function mapSaleDocsToListItems(docs: QueryDocumentSnapshot[]): SaleListItem[] {
  return docs.map((doc) => toListItem(toSale(doc.id, doc.data() as SaleDocument)));
}

function assertDraftSaleInTransaction(saleData: SaleDocument): void {
  if (saleData.deletedAt) {
    throw new DomainError('NOT_FOUND', 'Sale not found');
  }

  if (saleData.status !== 'draft') {
    throw new DomainError('VALIDATION_ERROR', 'Only draft sales can be modified');
  }
}

export const saleRepository = {
  async list(orgId: string, params: SaleListParams): Promise<SaleListResult> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const search = params.search ?? '';

    const snapshot = await getOrgCollection(orgId, 'sales')
      .where('deletedAt', '==', null)
      .get();

    const allItems = snapshot.docs
      .map((doc) => toSale(doc.id, doc.data() as SaleDocument))
      .map(toListItem)
      .filter((sale) => matchesSearch(sale, search))
      .filter((sale) => matchesStatus(sale, params.status))
      .sort((a, b) => {
        const dateCompare = b.saleDate.localeCompare(a.saleDate);

        if (dateCompare !== 0) {
          return dateCompare;
        }

        return b.saleNumber.localeCompare(a.saleNumber);
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

  /**
   * Firestore-native pagination for the Sales page (empty search).
   * Does not change {@link saleRepository.list} — reports/dashboard keep using list().
   */
  async listPage(orgId: string, params: SaleListPageParams): Promise<SaleListPageResult> {
    const pageSize = params.pageSize ?? 25;
    const status = params.status ?? 'all';
    const position = params.position;
    const baseQuery = buildSalesListBaseQuery(orgId, status);

    const totalSnapshot = await baseQuery.count().get();
    const total = totalSnapshot.data().count;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    if (total === 0) {
      return {
        items: [],
        total: 0,
        page: 1,
        pageSize,
        totalPages: 1,
        startCursor: null,
        endCursor: null,
      };
    }

    if ((position === 'next' || position === 'prev') && !params.cursor) {
      throw new DomainError('VALIDATION_ERROR', 'Pagination cursor is required');
    }

    let items: SaleListItem[];

    if (position === 'first') {
      const snapshot = await baseQuery
        .orderBy('saleDate', 'desc')
        .orderBy('saleNumber', 'desc')
        .limit(pageSize)
        .get();
      items = mapSaleDocsToListItems(snapshot.docs);
    } else if (position === 'next') {
      const cursor = params.cursor!;
      const snapshot = await baseQuery
        .orderBy('saleDate', 'desc')
        .orderBy('saleNumber', 'desc')
        .startAfter(cursor.saleDate, cursor.saleNumber)
        .limit(pageSize)
        .get();
      items = mapSaleDocsToListItems(snapshot.docs);
    } else if (position === 'prev') {
      const cursor = params.cursor!;
      const snapshot = await baseQuery
        .orderBy('saleDate', 'asc')
        .orderBy('saleNumber', 'asc')
        .startAfter(cursor.saleDate, cursor.saleNumber)
        .limit(pageSize)
        .get();
      items = mapSaleDocsToListItems(snapshot.docs).reverse();
    } else {
      const lastPageSize = total % pageSize === 0 ? pageSize : total % pageSize;
      const snapshot = await baseQuery
        .orderBy('saleDate', 'asc')
        .orderBy('saleNumber', 'asc')
        .limit(lastPageSize)
        .get();
      items = mapSaleDocsToListItems(snapshot.docs).reverse();
    }

    const page =
      position === 'first' ? 1 : position === 'last' ? totalPages : Math.min(params.page ?? 1, totalPages);

    const first = items[0];
    const last = items[items.length - 1];

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
      startCursor: first ? toPageCursor(first) : null,
      endCursor: last ? toPageCursor(last) : null,
    };
  },

  /**
   * Fetches fully-resolved completed sales including their `lines[]`,
   * so reports can aggregate stored per-line COGS.
   *
   * NOTE: Does NOT recalculate historical COGS; it uses stored `line.cogs`.
   */
  async listCompletedByDateWithLines(orgId: string, date: string): Promise<Sale[]> {
    const snapshot = await getOrgCollection(orgId, 'sales')
      .where('deletedAt', '==', null)
      .where('status', '==', 'completed')
      .where('saleDate', '==', date)
      .get();

    return snapshot.docs.map((doc) => toSale(doc.id, doc.data() as SaleDocument));
  },

  async listCompletedByDate(orgId: string, date: string): Promise<SaleListItem[]> {
    const sales = await saleRepository.listCompletedByDateWithLines(orgId, date);
    return sales.map(toListItem);
  },

  async getById(orgId: string, saleId: string): Promise<Sale | null> {
    const doc = await getOrgCollection(orgId, 'sales').doc(saleId).get();

    if (!doc.exists) {
      return null;
    }

    const sale = toSale(doc.id, doc.data() as SaleDocument);

    if (sale.deletedAt) {
      return null;
    }

    return sale;
  },

  async findBySaleNumber(
    orgId: string,
    saleNumber: string,
    excludeId?: string,
  ): Promise<Sale | null> {
    const normalizedNumber = saleNumber.trim().toUpperCase();
    const snapshot = await getOrgCollection(orgId, 'sales')
      .where('saleNumber', '==', normalizedNumber)
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

    return toSale(doc.id, doc.data() as SaleDocument);
  },

  /**
   * Full active-sale scan used only for one-time sequence initialization.
   * Do not call on every create — use documentSequences/sale instead.
   */
  async getHighestSaleNumber(orgId: string): Promise<number> {
    const snapshot = await getOrgCollection(orgId, 'sales')
      .where('deletedAt', '==', null)
      .get();

    let highest = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data() as SaleDocument;
      const value = parseSaleNumberSequence(data.saleNumber);

      if (value !== null && value > highest) {
        highest = value;
      }
    }

    return highest;
  },

  /**
   * Ensures organizations/{orgId}/documentSequences/sale exists.
   * One-time scan of active sales when the counter doc is missing.
   */
  async ensureSaleSequenceInitialized(orgId: string): Promise<void> {
    const sequenceRef = getOrgCollection(orgId, 'documentSequences').doc('sale');
    const existing = await sequenceRef.get();

    if (existing.exists) {
      return;
    }

    const highest = await this.getHighestSaleNumber(orgId);
    const firestore = getFirestore();

    await firestore.runTransaction(async (transaction) => {
      const snap = await transaction.get(sequenceRef);

      if (snap.exists) {
        return;
      }

      transaction.set(sequenceRef, {
        kind: 'sale',
        lastValue: highest,
        updatedAt: Timestamp.now(),
      });
    });
  },

  async create(
    orgId: string,
    input: {
      saleNumber?: string;
      saleDate: string;
      customerNameSnapshot: string | null;
      lines: SaleLineItem[];
      subtotal: number;
      notes?: string | null;
      importSource?: { importId: string; groupKey: string };
    },
    userId: string,
  ): Promise<Sale> {
    await this.ensureSaleSequenceInitialized(orgId);

    const firestore = getFirestore();
    const collection = getOrgCollection(orgId, 'sales');
    const docRef = collection.doc();
    const sequenceRef = getOrgCollection(orgId, 'documentSequences').doc('sale');
    const explicitSaleNumber = input.saleNumber?.trim().toUpperCase() || null;

    return firestore.runTransaction(async (transaction) => {
      const importSource = input.importSource;

      if (importSource) {
        const linkRef = importHistoryRepository.sourceSaleLinkRef(
          orgId,
          importSource.importId,
          importSource.groupKey,
        );
        const linkSnap = await transaction.get(linkRef);

        if (linkSnap.exists) {
          const existingSaleId = String(linkSnap.data()?.saleId ?? '');
          const existingSaleRef = collection.doc(existingSaleId);
          const existingSaleSnap = await transaction.get(existingSaleRef);

          if (!existingSaleSnap.exists) {
            throw new DomainError('NOT_FOUND', 'Sale not found');
          }

          const existingData = existingSaleSnap.data() as SaleDocument;

          if (existingData.deletedAt || existingData.organizationId !== orgId) {
            throw new DomainError('NOT_FOUND', 'Sale not found');
          }

          return toSale(existingSaleSnap.id, existingData);
        }

        if (explicitSaleNumber) {
          const lockRef = getOrgCollection(orgId, 'uniqueNumbers').doc(
            `sale_${explicitSaleNumber}`,
          );
          const lockSnap = await transaction.get(lockRef);

          if (lockSnap.exists) {
            const existingSaleId = String(lockSnap.data()?.documentId ?? '');

            if (!existingSaleId) {
              throw new DomainError('VALIDATION_ERROR', 'Sale number already exists');
            }

            const existingSaleRef = collection.doc(existingSaleId);
            const existingSaleSnap = await transaction.get(existingSaleRef);

            if (!existingSaleSnap.exists) {
              throw new DomainError('VALIDATION_ERROR', 'Sale number already exists');
            }

            const existingData = existingSaleSnap.data() as SaleDocument;

            if (existingData.deletedAt || existingData.organizationId !== orgId) {
              throw new DomainError('VALIDATION_ERROR', 'Sale number already exists');
            }

            if (existingData.importId !== importSource.importId) {
              throw new DomainError('VALIDATION_ERROR', 'Sale number already exists');
            }

            importHistoryRepository.writeSourceSaleLinkInTransaction(
              transaction,
              orgId,
              importSource.importId,
              importSource.groupKey,
              existingSaleSnap.id,
              userId,
            );

            return toSale(existingSaleSnap.id, existingData);
          }
        }
      }

      const sequenceSnap = await transaction.get(sequenceRef);
      const rawLastValue = sequenceSnap.exists
        ? Number(sequenceSnap.data()?.lastValue ?? 0)
        : 0;
      const lastValue =
        Number.isFinite(rawLastValue) && rawLastValue > 0 ? Math.floor(rawLastValue) : 0;

      let allocatedNumber: string;
      let nextLastValue = lastValue;

      if (explicitSaleNumber) {
        allocatedNumber = explicitSaleNumber;
        const parsed = parseSaleNumberSequence(allocatedNumber);
        if (parsed !== null && parsed > lastValue) {
          nextLastValue = parsed;
        }
      } else {
        const reservedProbe = new Set<number>();
        const maxAttempts = 1000;
        let allocated: { sequence: number; saleNumber: string } | null = null;

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          const candidate = findNextFreeSaleSequence(lastValue, (sequence) =>
            reservedProbe.has(sequence),
          );
          const lockRef = getOrgCollection(orgId, 'uniqueNumbers').doc(
            `sale_${candidate.saleNumber}`,
          );
          const lockSnap = await transaction.get(lockRef);

          if (!lockSnap.exists) {
            allocated = candidate;
            break;
          }

          reservedProbe.add(candidate.sequence);
        }

        if (!allocated) {
          throw new DomainError('VALIDATION_ERROR', 'Unable to allocate sale number');
        }

        allocatedNumber = allocated.saleNumber;
        nextLastValue = allocated.sequence;
      }

      await reserveUniqueNumberInTransaction(
        transaction,
        orgId,
        'sale',
        allocatedNumber,
        docRef.id,
      );

      transaction.set(sequenceRef, {
        kind: 'sale',
        lastValue: nextLastValue,
        updatedAt: Timestamp.now(),
      });

      const now = Timestamp.now();

      const document: SaleDocument = {
        organizationId: orgId,
        saleNumber: allocatedNumber,
        saleDate: input.saleDate,
        customerId: null,
        customerNameSnapshot: normalizeNullableString(input.customerNameSnapshot),
        status: 'draft',
        lines: input.lines.map((line) => ({
          id: line.id,
          productId: line.productId,
          productNameSnapshot: line.productNameSnapshot,
          productCodeSnapshot: line.productCodeSnapshot,
          sellingPriceSnapshot: line.sellingPriceSnapshot,
          quantity: line.quantity,
          unit: line.unit,
          lineTotal: line.lineTotal,
        })),
        subtotal: input.subtotal,
        totalCogs: 0,
        lineCount: input.lines.length,
        notes: normalizeNullableString(input.notes),
        ...(importSource ? { importId: importSource.importId } : {}),
        createdAt: now,
        createdBy: userId,
        updatedAt: now,
        updatedBy: userId,
        completedAt: null,
        completedBy: null,
        deletedAt: null,
        deletedBy: null,
      };

      transaction.set(docRef, document);

      if (importSource) {
        importHistoryRepository.writeSourceSaleLinkInTransaction(
          transaction,
          orgId,
          importSource.importId,
          importSource.groupKey,
          docRef.id,
          userId,
        );
      }

      return toSale(docRef.id, document);
    });
  },

  async update(
    orgId: string,
    saleId: string,
    input: {
      saleDate?: string;
      customerNameSnapshot?: string | null;
      lines?: SaleLineItem[];
      subtotal?: number;
      notes?: string | null;
    },
    userId: string,
  ): Promise<Sale> {
    const firestore = getFirestore();
    const audit = buildAuditFields(userId, false);

    const updates: Partial<SaleDocument> = {
      ...audit,
    };

    if (input.saleDate !== undefined) {
      updates.saleDate = input.saleDate;
    }

    if (input.customerNameSnapshot !== undefined) {
      updates.customerNameSnapshot = normalizeNullableString(input.customerNameSnapshot);
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
        sellingPriceSnapshot: line.sellingPriceSnapshot,
        quantity: line.quantity,
        unit: line.unit,
        lineTotal: line.lineTotal,
      }));
      updates.lineCount = input.lines.length;
    }

    if (input.subtotal !== undefined) {
      updates.subtotal = input.subtotal;
    }

    return firestore.runTransaction(async (transaction) => {
      const saleRef = getOrgCollection(orgId, 'sales').doc(saleId);
      const saleSnap = await transaction.get(saleRef);

      if (!saleSnap.exists) {
        throw new DomainError('NOT_FOUND', 'Sale not found');
      }

      const saleData = saleSnap.data() as SaleDocument;
      assertDraftSaleInTransaction(saleData);

      transaction.update(saleRef, updates);

      const updatedSale: SaleDocument = {
        ...saleData,
        ...updates,
      };

      return toSale(saleSnap.id, updatedSale);
    });
  },

  async softDelete(orgId: string, saleId: string, userId: string): Promise<void> {
    const firestore = getFirestore();

    await firestore.runTransaction(async (transaction) => {
      const saleRef = getOrgCollection(orgId, 'sales').doc(saleId);
      const saleSnap = await transaction.get(saleRef);

      if (!saleSnap.exists) {
        throw new DomainError('NOT_FOUND', 'Sale not found');
      }

      const saleData = saleSnap.data() as SaleDocument;
      assertDraftSaleInTransaction(saleData);

      const now = Timestamp.now();

      transaction.update(saleRef, {
        deletedAt: now,
        deletedBy: userId,
        updatedAt: now,
        updatedBy: userId,
      });
    });
  },

  async complete(orgId: string, saleId: string, userId: string): Promise<Sale> {
    const firestore = getFirestore();

    return firestore.runTransaction(async (transaction) => {
      const saleRef = getOrgCollection(orgId, 'sales').doc(saleId);
      const saleSnap = await transaction.get(saleRef);

      if (!saleSnap.exists) {
        throw new DomainError('NOT_FOUND', 'Sale not found');
      }

      const saleData = saleSnap.data() as SaleDocument;

      if (saleData.deletedAt) {
        throw new DomainError('NOT_FOUND', 'Sale not found');
      }

      if (saleData.status !== 'draft') {
        throw new DomainError('VALIDATION_ERROR', 'This sale has already been completed');
      }

      if (saleData.lines.length === 0) {
        throw new DomainError('VALIDATION_ERROR', 'Sale must have at least one product line');
      }

      const uniqueProductIds = [...new Set(saleData.lines.map((line) => line.productId))];
      const productRefs = new Map<string, DocumentReference>();
      const initialProductState = new Map<string, { currentStock: number; averageCost: number }>();
      const runningProductState = new Map<string, { qty: number; avgCost: number }>();
      const completedLines: SaleLineDocument[] = [];
      let totalCogs = 0;

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

      for (const line of saleData.lines) {
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
        const cogs = Math.round(line.quantity * unitCost);

        runningProductState.set(line.productId, {
          qty: newQty,
          avgCost: state.avgCost,
        });

        inventoryRepository.createMovementInTransaction(
          transaction,
          orgId,
          {
            movementDate: saleData.saleDate,
            itemType: 'finished_product',
            itemId: line.productId,
            itemName: line.productNameSnapshot,
            movementType: 'SALE_OUT',
            quantity: line.quantity,
            unit: line.unit,
            unitCost,
            totalCost: cogs,
            balanceAfter: newQty,
            averageCostAfter: state.avgCost,
            sourceDocumentType: 'sale',
            sourceDocumentId: saleId,
            sourceLineId: line.id,
          },
          userId,
        );

        completedLines.push({
          ...line,
          unitCost,
          cogs,
        });
        totalCogs += cogs;
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

      transaction.update(saleRef, {
        status: 'completed',
        lines: completedLines,
        totalCogs,
        completedAt: now,
        completedBy: userId,
        updatedAt: now,
        updatedBy: userId,
      });

      const updatedSale: SaleDocument = {
        ...saleData,
        status: 'completed',
        lines: completedLines,
        totalCogs,
        completedAt: now,
        completedBy: userId,
        updatedAt: now,
        updatedBy: userId,
      };

      return toSale(saleSnap.id, updatedSale);
    });
  },
};

export function generateSaleLineId(): string {
  return randomUUID();
}
