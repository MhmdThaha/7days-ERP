import 'server-only';

import { randomUUID } from 'crypto';

import {
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QueryDocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';

import {
  calculateLineUnitCost,
  scaleIngredientQuantity,
} from '@/lib/domain/calculations/production-materials';
import { calculateNewWac } from '@/lib/domain/calculations/wac';
import { DomainError } from '@/lib/domain/errors';
import {
  findNextFreeProductionSequence,
  parseProductionNumberSequence,
} from '@/lib/domain/production-number';
import { resolveProductionLineFormula } from '@/lib/domain/production/line-formula';
import { assertSufficientStock } from '@/lib/domain/inventory/stock-validation';
import { normalizeNullableString, timestampToDate } from '@/lib/firebase/converters';
import {
  buildAuditFields,
  getFirestore,
  getOrgCollection,
} from '@/lib/repositories/base.repository';
import { inventoryRepository } from '@/lib/repositories/inventory.repository';
import { reserveUniqueNumberInTransaction } from '@/lib/repositories/unique-number.repository';
import type {
  Production,
  ProductionLineItem,
  ProductionListItem,
  ProductionListPageParams,
  ProductionListPageResult,
  ProductionListParams,
  ProductionListResult,
  ProductionPageCursor,
  ProductionStatus,
  ProductionStatusFilter,
} from '@/types/production';

type RecipeIngredientDocument = {
  rawMaterialId: string;
  rawMaterialName: string;
  quantity: number;
  unit: string;
};

type RecipeDocument = {
  productId: string;
  batchOutputQuantity?: number | null;
  ingredients: RecipeIngredientDocument[];
  isActive: boolean;
  deletedAt: Timestamp | null;
};

type RawMaterialDocument = {
  deletedAt: Timestamp | null;
  isActive: boolean;
  currentStock: number;
  averageCost: number;
};

type ProductDocument = {
  deletedAt: Timestamp | null;
  isActive: boolean;
  currentStock: number;
  averageCost: number;
  unit: string;
};

type ProductionLineDocument = {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  recipeId: string;
  recipeCode: string;
  recipeName: string;
  recipeVersion: number;
  recipeBatchOutputQuantity?: number | null;
  recipeIngredients?: RecipeIngredientDocument[];
};

type ProductionDocument = {
  organizationId: string;
  productionNumber: string;
  productionDate: string;
  status: ProductionStatus;
  lines: ProductionLineDocument[];
  totalUnits: number;
  lineCount: number;
  notes: string | null;
  acceptedStaleRecipe?: boolean;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  completedAt: Timestamp | null;
  completedBy: string | null;
  deletedAt: Timestamp | null;
  deletedBy: string | null;
};

function toLineDocument(line: ProductionLineItem): ProductionLineDocument {
  return {
    id: line.id,
    productId: line.productId,
    productCode: line.productCode,
    productName: line.productName,
    quantity: line.quantity,
    unit: line.unit,
    recipeId: line.recipeId,
    recipeCode: line.recipeCode,
    recipeName: line.recipeName,
    recipeVersion: line.recipeVersion,
    recipeBatchOutputQuantity: line.recipeBatchOutputQuantity ?? null,
    recipeIngredients: (line.recipeIngredients ?? []).map((ingredient) => ({
      rawMaterialId: ingredient.rawMaterialId,
      rawMaterialName: ingredient.rawMaterialName,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
    })),
  };
}

function toLineItem(data: ProductionLineDocument): ProductionLineItem {
  return {
    id: data.id,
    productId: data.productId,
    productCode: data.productCode,
    productName: data.productName,
    quantity: data.quantity,
    unit: data.unit,
    recipeId: data.recipeId,
    recipeCode: data.recipeCode,
    recipeName: data.recipeName,
    recipeVersion: data.recipeVersion,
    recipeBatchOutputQuantity:
      typeof data.recipeBatchOutputQuantity === 'number' ? data.recipeBatchOutputQuantity : null,
    recipeIngredients: (data.recipeIngredients ?? []).map((ingredient) => ({
      rawMaterialId: ingredient.rawMaterialId,
      rawMaterialName: ingredient.rawMaterialName,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
    })),
  };
}

function toProduction(id: string, data: ProductionDocument): Production {
  return {
    id,
    organizationId: data.organizationId,
    productionNumber: data.productionNumber,
    productionDate: data.productionDate,
    status: data.status,
    lines: data.lines.map(toLineItem),
    totalUnits: data.totalUnits,
    lineCount: data.lineCount,
    notes: data.notes,
    acceptedStaleRecipe: data.acceptedStaleRecipe === true,
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

function toListItem(production: Production): ProductionListItem {
  return {
    id: production.id,
    productionNumber: production.productionNumber,
    productionDate: production.productionDate,
    lineCount: production.lineCount,
    totalUnits: production.totalUnits,
    status: production.status,
    createdAt: production.createdAt,
    updatedAt: production.updatedAt,
  };
}

function matchesSearch(production: ProductionListItem, search: string): boolean {
  const term = search.trim().toLowerCase();

  if (!term) {
    return true;
  }

  return production.productionNumber.toLowerCase().includes(term);
}

function matchesStatus(
  production: ProductionListItem,
  status: ProductionStatusFilter | undefined,
): boolean {
  if (!status || status === 'all') {
    return true;
  }

  return production.status === status;
}

function toPageCursor(production: ProductionListItem): ProductionPageCursor {
  return {
    productionDate: production.productionDate,
    productionNumber: production.productionNumber,
  };
}

function buildProductionListBaseQuery(
  orgId: string,
  status: ProductionStatusFilter | undefined,
): Query {
  let query: Query = getOrgCollection(orgId, 'production').where('deletedAt', '==', null);

  if (status && status !== 'all') {
    query = query.where('status', '==', status);
  }

  return query;
}

function mapProductionDocsToListItems(docs: QueryDocumentSnapshot[]): ProductionListItem[] {
  return docs.map((doc) => toListItem(toProduction(doc.id, doc.data() as ProductionDocument)));
}

function assertDraftProductionInTransaction(productionData: ProductionDocument): void {
  if (productionData.deletedAt) {
    throw new DomainError('NOT_FOUND', 'Production entry not found');
  }

  if (productionData.status !== 'draft') {
    throw new DomainError('VALIDATION_ERROR', 'Only draft production entries can be modified');
  }
}

/** Same chunk size as catalog getByIds `firestore.getAll` usage in this codebase. */
const TRANSACTION_GET_ALL_CHUNK_SIZE = 100;

async function getAllInTransaction(
  transaction: Transaction,
  refs: DocumentReference[],
): Promise<DocumentSnapshot[]> {
  if (refs.length === 0) {
    return [];
  }

  const snapshots: DocumentSnapshot[] = [];

  for (let start = 0; start < refs.length; start += TRANSACTION_GET_ALL_CHUNK_SIZE) {
    const chunk = refs.slice(start, start + TRANSACTION_GET_ALL_CHUNK_SIZE);
    const chunkSnapshots = await transaction.getAll(...chunk);
    snapshots.push(...chunkSnapshots);
  }

  return snapshots;
}

export const productionRepository = {
  async list(orgId: string, params: ProductionListParams): Promise<ProductionListResult> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const search = params.search ?? '';

    const snapshot = await getOrgCollection(orgId, 'production')
      .where('deletedAt', '==', null)
      .get();

    const allItems = snapshot.docs
      .map((doc) => toProduction(doc.id, doc.data() as ProductionDocument))
      .map(toListItem)
      .filter((production) => matchesSearch(production, search))
      .filter((production) => matchesStatus(production, params.status))
      .sort((a, b) => {
        const dateCompare = b.productionDate.localeCompare(a.productionDate);

        if (dateCompare !== 0) {
          return dateCompare;
        }

        return b.productionNumber.localeCompare(a.productionNumber);
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
   * Repeat Last: one non-deleted Production, same order as {@link productionRepository.list}
   * (productionDate DESC, then productionNumber DESC). Does not run count() or load the collection.
   */
  async getLatestForRepeat(orgId: string): Promise<ProductionListItem | null> {
    const snapshot = await getOrgCollection(orgId, 'production')
      .where('deletedAt', '==', null)
      .orderBy('productionDate', 'desc')
      .orderBy('productionNumber', 'desc')
      .limit(1)
      .get();

    const doc = snapshot.docs[0];

    if (!doc) {
      return null;
    }

    return toListItem(toProduction(doc.id, doc.data() as ProductionDocument));
  },

  /**
   * Firestore-native pagination for the Production page (empty search).
   * Does not change {@link productionRepository.list} — reports keep using list().
   */
  async listPage(
    orgId: string,
    params: ProductionListPageParams,
  ): Promise<ProductionListPageResult> {
    const pageSize = params.pageSize ?? 25;
    const status = params.status ?? 'all';
    const position = params.position;
    const baseQuery = buildProductionListBaseQuery(orgId, status);

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

    let items: ProductionListItem[];

    if (position === 'first') {
      const snapshot = await baseQuery
        .orderBy('productionDate', 'desc')
        .orderBy('productionNumber', 'desc')
        .limit(pageSize)
        .get();
      items = mapProductionDocsToListItems(snapshot.docs);
    } else if (position === 'next') {
      const cursor = params.cursor!;
      const snapshot = await baseQuery
        .orderBy('productionDate', 'desc')
        .orderBy('productionNumber', 'desc')
        .startAfter(cursor.productionDate, cursor.productionNumber)
        .limit(pageSize)
        .get();
      items = mapProductionDocsToListItems(snapshot.docs);
    } else if (position === 'prev') {
      const cursor = params.cursor!;
      const snapshot = await baseQuery
        .orderBy('productionDate', 'asc')
        .orderBy('productionNumber', 'asc')
        .startAfter(cursor.productionDate, cursor.productionNumber)
        .limit(pageSize)
        .get();
      items = mapProductionDocsToListItems(snapshot.docs).reverse();
    } else {
      const lastPageSize = total % pageSize === 0 ? pageSize : total % pageSize;
      const snapshot = await baseQuery
        .orderBy('productionDate', 'asc')
        .orderBy('productionNumber', 'asc')
        .limit(lastPageSize)
        .get();
      items = mapProductionDocsToListItems(snapshot.docs).reverse();
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

  async listCompletedByDateWithLines(orgId: string, date: string): Promise<Production[]> {
    const snapshot = await getOrgCollection(orgId, 'production')
      .where('deletedAt', '==', null)
      .where('status', '==', 'completed')
      .where('productionDate', '==', date)
      .get();

    return snapshot.docs.map((doc) => toProduction(doc.id, doc.data() as ProductionDocument));
  },

  async listCompletedByDate(orgId: string, date: string): Promise<ProductionListItem[]> {
    const productions = await productionRepository.listCompletedByDateWithLines(orgId, date);
    return productions.map(toListItem);
  },

  async getById(orgId: string, productionId: string): Promise<Production | null> {
    const doc = await getOrgCollection(orgId, 'production').doc(productionId).get();

    if (!doc.exists) {
      return null;
    }

    const production = toProduction(doc.id, doc.data() as ProductionDocument);

    if (production.deletedAt) {
      return null;
    }

    return production;
  },

  async findByProductionNumber(
    orgId: string,
    productionNumber: string,
    excludeId?: string,
  ): Promise<Production | null> {
    const normalizedNumber = productionNumber.trim().toUpperCase();
    const snapshot = await getOrgCollection(orgId, 'production')
      .where('productionNumber', '==', normalizedNumber)
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

    return toProduction(doc.id, doc.data() as ProductionDocument);
  },

  /**
   * Full active-production scan used only for one-time sequence initialization.
   * Do not call on every create — use documentSequences/production instead.
   */
  async getHighestProductionNumber(orgId: string): Promise<number> {
    const snapshot = await getOrgCollection(orgId, 'production')
      .where('deletedAt', '==', null)
      .get();

    let highest = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data() as ProductionDocument;
      const value = parseProductionNumberSequence(data.productionNumber);

      if (value !== null && value > highest) {
        highest = value;
      }
    }

    return highest;
  },

  /**
   * Ensures organizations/{orgId}/documentSequences/production exists.
   * One-time scan of active productions when the counter doc is missing.
   */
  async ensureProductionSequenceInitialized(orgId: string): Promise<void> {
    const sequenceRef = getOrgCollection(orgId, 'documentSequences').doc('production');
    const existing = await sequenceRef.get();

    if (existing.exists) {
      return;
    }

    const highest = await this.getHighestProductionNumber(orgId);
    const firestore = getFirestore();

    await firestore.runTransaction(async (transaction) => {
      const snap = await transaction.get(sequenceRef);

      if (snap.exists) {
        return;
      }

      transaction.set(sequenceRef, {
        kind: 'production',
        lastValue: highest,
        updatedAt: Timestamp.now(),
      });
    });
  },

  async create(
    orgId: string,
    input: {
      productionDate: string;
      lines: ProductionLineItem[];
      totalUnits: number;
      notes?: string | null;
    },
    userId: string,
  ): Promise<Production> {
    await this.ensureProductionSequenceInitialized(orgId);

    const firestore = getFirestore();
    const collection = getOrgCollection(orgId, 'production');
    const docRef = collection.doc();
    const sequenceRef = getOrgCollection(orgId, 'documentSequences').doc('production');

    return firestore.runTransaction(async (transaction) => {
      const sequenceSnap = await transaction.get(sequenceRef);
      const rawLastValue = sequenceSnap.exists
        ? Number(sequenceSnap.data()?.lastValue ?? 0)
        : 0;
      const lastValue =
        Number.isFinite(rawLastValue) && rawLastValue > 0 ? Math.floor(rawLastValue) : 0;

      const reservedProbe = new Set<number>();
      const maxAttempts = 1000;
      let allocated: { sequence: number; productionNumber: string } | null = null;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const candidate = findNextFreeProductionSequence(lastValue, (sequence) =>
          reservedProbe.has(sequence),
        );
        const lockRef = getOrgCollection(orgId, 'uniqueNumbers').doc(
          `production_${candidate.productionNumber}`,
        );
        const lockSnap = await transaction.get(lockRef);

        if (!lockSnap.exists) {
          allocated = candidate;
          break;
        }

        reservedProbe.add(candidate.sequence);
      }

      if (!allocated) {
        throw new DomainError('VALIDATION_ERROR', 'Unable to allocate production number');
      }

      await reserveUniqueNumberInTransaction(
        transaction,
        orgId,
        'production',
        allocated.productionNumber,
        docRef.id,
      );

      transaction.set(sequenceRef, {
        kind: 'production',
        lastValue: allocated.sequence,
        updatedAt: Timestamp.now(),
      });

      const now = Timestamp.now();

      const document: ProductionDocument = {
        organizationId: orgId,
        productionNumber: allocated.productionNumber,
        productionDate: input.productionDate,
        status: 'draft',
        lines: input.lines.map(toLineDocument),
        totalUnits: input.totalUnits,
        lineCount: input.lines.length,
        notes: normalizeNullableString(input.notes),
        acceptedStaleRecipe: false,
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
      return toProduction(docRef.id, document);
    });
  },

  async update(
    orgId: string,
    productionId: string,
    input: {
      productionDate?: string;
      lines?: ProductionLineItem[];
      totalUnits?: number;
      notes?: string | null;
      acceptedStaleRecipe?: boolean;
    },
    userId: string,
  ): Promise<Production> {
    const firestore = getFirestore();
    const audit = buildAuditFields(userId, false);

    const updates: Partial<ProductionDocument> = {
      ...audit,
    };

    if (input.productionDate !== undefined) {
      updates.productionDate = input.productionDate;
    }

    if (input.notes !== undefined) {
      updates.notes = normalizeNullableString(input.notes);
    }

    if (input.acceptedStaleRecipe !== undefined) {
      updates.acceptedStaleRecipe = input.acceptedStaleRecipe;
    }

    if (input.lines !== undefined) {
      updates.lines = input.lines.map(toLineDocument);
      updates.lineCount = input.lines.length;
    }

    if (input.totalUnits !== undefined) {
      updates.totalUnits = input.totalUnits;
    }

    return firestore.runTransaction(async (transaction) => {
      const productionRef = getOrgCollection(orgId, 'production').doc(productionId);
      const productionSnap = await transaction.get(productionRef);

      if (!productionSnap.exists) {
        throw new DomainError('NOT_FOUND', 'Production entry not found');
      }

      const productionData = productionSnap.data() as ProductionDocument;
      assertDraftProductionInTransaction(productionData);

      transaction.update(productionRef, updates);

      const updatedProduction: ProductionDocument = {
        ...productionData,
        ...updates,
      };

      return toProduction(productionSnap.id, updatedProduction);
    });
  },

  async softDelete(orgId: string, productionId: string, userId: string): Promise<void> {
    const firestore = getFirestore();

    await firestore.runTransaction(async (transaction) => {
      const productionRef = getOrgCollection(orgId, 'production').doc(productionId);
      const productionSnap = await transaction.get(productionRef);

      if (!productionSnap.exists) {
        throw new DomainError('NOT_FOUND', 'Production entry not found');
      }

      const productionData = productionSnap.data() as ProductionDocument;
      assertDraftProductionInTransaction(productionData);

      const now = Timestamp.now();

      transaction.update(productionRef, {
        deletedAt: now,
        deletedBy: userId,
        updatedAt: now,
        updatedBy: userId,
      });
    });
  },

  async complete(orgId: string, productionId: string, userId: string): Promise<Production> {
    const firestore = getFirestore();

    return firestore.runTransaction(async (transaction) => {
      const productionRef = getOrgCollection(orgId, 'production').doc(productionId);
      const productionSnap = await transaction.get(productionRef);

      if (!productionSnap.exists) {
        throw new DomainError('NOT_FOUND', 'Production entry not found');
      }

      const productionData = productionSnap.data() as ProductionDocument;

      if (productionData.deletedAt) {
        throw new DomainError('NOT_FOUND', 'Production entry not found');
      }

      if (productionData.status !== 'draft') {
        throw new DomainError('VALIDATION_ERROR', 'This production has already been completed');
      }

      if (productionData.lines.length === 0) {
        throw new DomainError('VALIDATION_ERROR', 'Production must have at least one product line');
      }

      const uniqueRecipeIds = [...new Set(productionData.lines.map((line) => line.recipeId))];
      const uniqueProductIds = [...new Set(productionData.lines.map((line) => line.productId))];

      const recipeCollection = getOrgCollection(orgId, 'recipes');
      const productCollection = getOrgCollection(orgId, 'products');
      const recipeRefs = uniqueRecipeIds.map((recipeId) => recipeCollection.doc(recipeId));
      const productRefsList = uniqueProductIds.map((productId) => productCollection.doc(productId));

      const masterSnapshots = await getAllInTransaction(transaction, [
        ...recipeRefs,
        ...productRefsList,
      ]);
      const recipeSnapshots = masterSnapshots.slice(0, recipeRefs.length);
      const productSnapshots = masterSnapshots.slice(recipeRefs.length);

      const recipeById = new Map<string, RecipeDocument>();

      for (let index = 0; index < uniqueRecipeIds.length; index += 1) {
        const recipeId = uniqueRecipeIds[index]!;
        const recipeSnap = recipeSnapshots[index];

        if (!recipeSnap?.exists) {
          throw new DomainError('NOT_FOUND', 'One or more recipes were not found');
        }

        const recipeData = recipeSnap.data() as RecipeDocument;

        if (recipeData.deletedAt) {
          throw new DomainError('NOT_FOUND', 'One or more recipes were not found');
        }

        if (!recipeData.isActive) {
          throw new DomainError('VALIDATION_ERROR', 'One or more recipes are inactive');
        }

        recipeById.set(recipeId, recipeData);
      }

      const acceptedStaleRecipe = productionData.acceptedStaleRecipe === true;
      const uniqueRawMaterialIds = new Set<string>();
      const formulaByLineId = new Map<
        string,
        ReturnType<typeof resolveProductionLineFormula>
      >();

      for (const line of productionData.lines) {
        const recipe = recipeById.get(line.recipeId);

        if (!recipe) {
          throw new DomainError('NOT_FOUND', 'One or more recipes were not found');
        }

        if (recipe.productId !== line.productId) {
          throw new DomainError('VALIDATION_ERROR', 'Recipe does not match the selected product');
        }

        const formula = resolveProductionLineFormula({
          acceptedStaleRecipe,
          snapshotIngredients: line.recipeIngredients,
          snapshotBatchOutputQuantity: line.recipeBatchOutputQuantity,
          liveIngredients: recipe.ingredients,
          liveBatchOutputQuantity: recipe.batchOutputQuantity,
        });

        formulaByLineId.set(line.id, formula);

        for (const ingredient of formula.ingredients) {
          uniqueRawMaterialIds.add(ingredient.rawMaterialId);
        }
      }

      const rawMaterialRefs = new Map<string, DocumentReference>();
      const initialRawMaterialState = new Map<
        string,
        { currentStock: number; averageCost: number }
      >();
      const runningRawMaterialState = new Map<string, { qty: number; avgCost: number }>();

      const rawMaterialIdList = [...uniqueRawMaterialIds];
      const rawMaterialCollection = getOrgCollection(orgId, 'rawMaterials');
      const rawMaterialRefList = rawMaterialIdList.map((rawMaterialId) =>
        rawMaterialCollection.doc(rawMaterialId),
      );
      const rawMaterialSnapshots = await getAllInTransaction(transaction, rawMaterialRefList);

      for (let index = 0; index < rawMaterialIdList.length; index += 1) {
        const rawMaterialId = rawMaterialIdList[index]!;
        const rawMaterialRef = rawMaterialRefList[index]!;
        const rawMaterialSnap = rawMaterialSnapshots[index];

        if (!rawMaterialSnap?.exists) {
          throw new DomainError('NOT_FOUND', 'One or more raw materials were not found');
        }

        const rawMaterialData = rawMaterialSnap.data() as RawMaterialDocument;

        if (rawMaterialData.deletedAt) {
          throw new DomainError('NOT_FOUND', 'One or more raw materials were not found');
        }

        if (!rawMaterialData.isActive) {
          throw new DomainError('VALIDATION_ERROR', 'One or more raw materials are inactive');
        }

        rawMaterialRefs.set(rawMaterialId, rawMaterialRef);
        initialRawMaterialState.set(rawMaterialId, {
          currentStock: rawMaterialData.currentStock ?? 0,
          averageCost: rawMaterialData.averageCost ?? 0,
        });
        runningRawMaterialState.set(rawMaterialId, {
          qty: rawMaterialData.currentStock ?? 0,
          avgCost: rawMaterialData.averageCost ?? 0,
        });
      }

      const productRefs = new Map<string, DocumentReference>();
      const initialProductState = new Map<string, { currentStock: number; averageCost: number }>();
      const runningProductState = new Map<string, { qty: number; avgCost: number }>();
      const productUnits = new Map<string, string>();

      for (let index = 0; index < uniqueProductIds.length; index += 1) {
        const productId = uniqueProductIds[index]!;
        const productRef = productRefsList[index]!;
        const productSnap = productSnapshots[index];

        if (!productSnap?.exists) {
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
        productUnits.set(productId, productData.unit);
        initialProductState.set(productId, {
          currentStock: productData.currentStock ?? 0,
          averageCost: productData.averageCost ?? 0,
        });
        runningProductState.set(productId, {
          qty: productData.currentStock ?? 0,
          avgCost: productData.averageCost ?? 0,
        });
      }

      for (const line of productionData.lines) {
        const recipe = recipeById.get(line.recipeId);
        const formula = formulaByLineId.get(line.id);

        if (!recipe || !formula) {
          throw new DomainError('NOT_FOUND', 'One or more recipes were not found');
        }

        const wacAtConsumption = new Map<string, number>();

        for (const ingredient of formula.ingredients) {
          const state = runningRawMaterialState.get(ingredient.rawMaterialId);

          if (!state) {
            throw new DomainError('NOT_FOUND', 'One or more raw materials were not found');
          }

          wacAtConsumption.set(ingredient.rawMaterialId, state.avgCost);
        }

        const batchOutputQuantity = formula.batchOutputQuantity;

        const lineUnitCost = calculateLineUnitCost(
          formula.ingredients,
          line.quantity,
          wacAtConsumption,
          batchOutputQuantity,
        );

        for (const ingredient of formula.ingredients) {
          const state = runningRawMaterialState.get(ingredient.rawMaterialId);

          if (!state) {
            throw new DomainError('NOT_FOUND', 'One or more raw materials were not found');
          }

          const consumed = scaleIngredientQuantity(
            ingredient.quantity,
            line.quantity,
            batchOutputQuantity,
          );
          const unitCost = state.avgCost;
          const totalCost = Math.round(consumed * unitCost);

          assertSufficientStock(state.qty, consumed, ingredient.rawMaterialName);

          const newQty = state.qty - consumed;

          runningRawMaterialState.set(ingredient.rawMaterialId, {
            qty: newQty,
            avgCost: state.avgCost,
          });

          inventoryRepository.createMovementInTransaction(
            transaction,
            orgId,
            {
              movementDate: productionData.productionDate,
              itemType: 'raw_material',
              itemId: ingredient.rawMaterialId,
              itemName: ingredient.rawMaterialName,
              movementType: 'PRODUCTION_RAW_OUT',
              quantity: consumed,
              unit: ingredient.unit,
              unitCost,
              totalCost,
              balanceAfter: newQty,
              averageCostAfter: state.avgCost,
              sourceDocumentType: 'production',
              sourceDocumentId: productionId,
              sourceLineId: line.id,
            },
            userId,
          );
        }

        const productState = runningProductState.get(line.productId);

        if (!productState) {
          throw new DomainError('NOT_FOUND', 'One or more products were not found');
        }

        const lineTotalCost = Math.round(lineUnitCost * line.quantity);
        const { newQty: newProductQty, newAvgCost: newProductAvgCost } = calculateNewWac(
          productState.qty,
          productState.avgCost,
          line.quantity,
          lineUnitCost,
        );

        runningProductState.set(line.productId, {
          qty: newProductQty,
          avgCost: newProductAvgCost,
        });

        inventoryRepository.createMovementInTransaction(
          transaction,
          orgId,
          {
            movementDate: productionData.productionDate,
            itemType: 'finished_product',
            itemId: line.productId,
            itemName: line.productName,
            movementType: 'PRODUCTION_FINISHED_IN',
            quantity: line.quantity,
            unit: line.unit || productUnits.get(line.productId) || '',
            unitCost: lineUnitCost,
            totalCost: lineTotalCost,
            balanceAfter: newProductQty,
            averageCostAfter: newProductAvgCost,
            sourceDocumentType: 'production',
            sourceDocumentId: productionId,
            sourceLineId: line.id,
          },
          userId,
        );
      }

      const audit = buildAuditFields(userId, false);

      for (const rawMaterialId of uniqueRawMaterialIds) {
        const initial = initialRawMaterialState.get(rawMaterialId);
        const finalState = runningRawMaterialState.get(rawMaterialId);
        const rawMaterialRef = rawMaterialRefs.get(rawMaterialId);

        if (!initial || !finalState || !rawMaterialRef) {
          continue;
        }

        if (finalState.qty !== initial.currentStock) {
          transaction.update(rawMaterialRef, {
            currentStock: finalState.qty,
            ...audit,
          });
        }
      }

      for (const productId of uniqueProductIds) {
        const initial = initialProductState.get(productId);
        const finalState = runningProductState.get(productId);
        const productRef = productRefs.get(productId);

        if (!initial || !finalState || !productRef) {
          continue;
        }

        if (
          finalState.qty !== initial.currentStock ||
          finalState.avgCost !== initial.averageCost
        ) {
          transaction.update(productRef, {
            currentStock: finalState.qty,
            averageCost: finalState.avgCost,
            ...audit,
          });
        }
      }

      const now = Timestamp.now();

      transaction.update(productionRef, {
        status: 'completed',
        completedAt: now,
        completedBy: userId,
        updatedAt: now,
        updatedBy: userId,
      });

      const updatedProduction: ProductionDocument = {
        ...productionData,
        status: 'completed',
        completedAt: now,
        completedBy: userId,
        updatedAt: now,
        updatedBy: userId,
      };

      return toProduction(productionSnap.id, updatedProduction);
    });
  },
};

export function generateProductionLineId(): string {
  return randomUUID();
}
