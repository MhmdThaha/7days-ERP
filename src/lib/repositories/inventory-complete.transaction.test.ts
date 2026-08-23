/**
 * Stock + movement regression for existing receive/complete transactions.
 *
 * Uses an in-memory Firestore that implements runTransaction + get/set/update.
 * Sequential duplicate completes are proven locally. True multi-client
 * Firestore contention is NOT TESTED here.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainError } from '@/lib/domain/errors';

type DocMap = Map<string, Record<string, unknown>>;

type DocRef = {
  id: string;
  path: string;
  collection: (name: string) => CollectionRef;
};

type CollectionRef = {
  doc: (id?: string) => DocRef;
};

function createInMemoryFirestore() {
  const docs: DocMap = new Map();
  let autoId = 0;
  const counters = {
    getCalls: 0,
    getAllCalls: 0,
    getAllRefCounts: [] as number[],
  };

  function collectionAt(basePath: string): CollectionRef {
    return {
      doc(id?: string): DocRef {
        const docId = id ?? `auto-${++autoId}`;
        const path = `${basePath}/${docId}`;

        return {
          id: docId,
          path,
          collection: (name: string) => collectionAt(`${path}/${name}`),
        };
      },
    };
  }

  const db = {
    collection: (name: string) => collectionAt(name),
    async runTransaction<T>(
      fn: (transaction: {
        get: (ref: DocRef) => Promise<{
          exists: boolean;
          id: string;
          data: () => Record<string, unknown> | undefined;
        }>;
        getAll: (
          ...refs: DocRef[]
        ) => Promise<
          Array<{
            exists: boolean;
            id: string;
            data: () => Record<string, unknown> | undefined;
          }>
        >;
        set: (ref: DocRef, data: Record<string, unknown>) => void;
        update: (ref: DocRef, data: Record<string, unknown>) => void;
      }) => Promise<T>,
    ): Promise<T> {
      const pending: Array<
        | { kind: 'set'; path: string; data: Record<string, unknown> }
        | { kind: 'update'; path: string; data: Record<string, unknown> }
      > = [];

      const getSnapshot = (ref: DocRef) => {
        const data = docs.get(ref.path);

        return {
          exists: data !== undefined,
          id: ref.id,
          data: () => data,
        };
      };

      const result = await fn({
        get: async (ref) => {
          counters.getCalls += 1;
          return getSnapshot(ref);
        },
        getAll: async (...refs) => {
          counters.getAllCalls += 1;
          counters.getAllRefCounts.push(refs.length);
          return refs.map(getSnapshot);
        },
        set: (ref, data) => {
          pending.push({ kind: 'set', path: ref.path, data: { ...data } });
        },
        update: (ref, data) => {
          pending.push({ kind: 'update', path: ref.path, data: { ...data } });
        },
      });

      for (const write of pending) {
        if (write.kind === 'set') {
          docs.set(write.path, { ...write.data });
          continue;
        }

        const previous = docs.get(write.path);

        if (!previous) {
          throw new Error(`Missing document for update: ${write.path}`);
        }

        docs.set(write.path, { ...previous, ...write.data });
      }

      return result;
    },
  };

  return { db, docs, stats: counters };
}

const harness = vi.hoisted(() => ({
  current: null as {
    db: unknown;
    docs: Map<string, Record<string, unknown>>;
    stats: { getCalls: number; getAllCalls: number; getAllRefCounts: number[] };
  } | null,
}));

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => {
    if (!harness.current) {
      throw new Error('In-memory Firestore was not initialized');
    }

    return harness.current.db;
  },
}));

import { productionRepository } from '@/lib/repositories/production.repository';
import { purchaseRepository } from '@/lib/repositories/purchase.repository';
import { returnRepository } from '@/lib/repositories/return.repository';
import { saleRepository } from '@/lib/repositories/sale.repository';
import { wastageRepository } from '@/lib/repositories/wastage.repository';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const USER = 'user-1';

function path(orgId: string, collection: string, id: string) {
  return `organizations/${orgId}/${collection}/${id}`;
}

function seed(orgId: string, collection: string, id: string, data: Record<string, unknown>) {
  harness.current?.docs.set(path(orgId, collection, id), data);
}

function read(orgId: string, collection: string, id: string) {
  return harness.current?.docs.get(path(orgId, collection, id));
}

function movements(orgId: string) {
  const prefix = `organizations/${orgId}/inventoryMovements/`;

  return [...(harness.current?.docs.entries() ?? [])]
    .filter(([docPath]) => docPath.startsWith(prefix))
    .map(([, data]) => data);
}

function auditFields() {
  const now = Timestamp.now();

  return {
    createdAt: now,
    createdBy: USER,
    updatedAt: now,
    updatedBy: USER,
    deletedAt: null,
    deletedBy: null,
  };
}

function seedProduct(
  orgId: string,
  id: string,
  stock: number,
  averageCost: number,
  extras: Record<string, unknown> = {},
) {
  seed(orgId, 'products', id, {
    organizationId: orgId,
    name: extras['name'] ?? 'Milk Bread',
    code: extras['code'] ?? 'MB-1',
    unit: extras['unit'] ?? 'pcs',
    isActive: true,
    currentStock: stock,
    averageCost,
    ...auditFields(),
    ...extras,
  });
}

function seedRawMaterial(orgId: string, id: string, stock: number, averageCost: number) {
  seed(orgId, 'rawMaterials', id, {
    organizationId: orgId,
    name: 'Flour',
    code: 'FL-1',
    unit: 'kg',
    isActive: true,
    currentStock: stock,
    averageCost,
    ...auditFields(),
  });
}

describe('inventory complete/receive transactions', () => {
  beforeEach(() => {
    harness.current = createInMemoryFirestore();
  });

  it('purchase receive increases raw-material stock, writes PURCHASE_IN, and blends WAC', async () => {
    seedRawMaterial(ORG_A, 'rm-flour', 10, 100);
    seed(ORG_A, 'purchases', 'pur-1', {
      organizationId: ORG_A,
      purchaseNumber: 'PUR-001',
      purchaseDate: '2026-08-14',
      supplierName: 'Mill',
      invoiceNumber: null,
      status: 'draft',
      paymentStatus: 'unpaid',
      lineItems: [
        {
          id: 'pl-1',
          rawMaterialId: 'rm-flour',
          rawMaterialCode: 'FL-1',
          rawMaterialName: 'Flour',
          quantity: 10,
          unit: 'kg',
          unitCost: 200,
          lineTotal: 2000,
        },
      ],
      totalAmount: 2000,
      lineItemCount: 1,
      notes: null,
      receivedAt: null,
      receivedBy: null,
      ...auditFields(),
    });

    const received = await purchaseRepository.receive(ORG_A, 'pur-1', USER);

    expect(received.status).toBe('received');
    expect(read(ORG_A, 'rawMaterials', 'rm-flour')).toMatchObject({
      currentStock: 20,
      averageCost: 150,
    });
    expect(movements(ORG_A)).toEqual([
      expect.objectContaining({
        movementType: 'PURCHASE_IN',
        itemId: 'rm-flour',
        quantity: 10,
        balanceAfter: 20,
        averageCostAfter: 150,
        sourceDocumentId: 'pur-1',
        organizationId: ORG_A,
      }),
    ]);
  });

  it('purchase receive WAC uses line unitCost, not invoice totalAmount after discount', async () => {
    seedRawMaterial(ORG_A, 'rm-flour', 10, 100);
    seed(ORG_A, 'purchases', 'pur-discount', {
      organizationId: ORG_A,
      purchaseNumber: 'PUR-002',
      purchaseDate: '2026-08-14',
      supplierName: 'Mill',
      invoiceNumber: null,
      status: 'draft',
      paymentStatus: 'unpaid',
      lineItems: [
        {
          id: 'pl-1',
          rawMaterialId: 'rm-flour',
          rawMaterialCode: 'FL-1',
          rawMaterialName: 'Flour',
          quantity: 10,
          unit: 'kg',
          unitCost: 200,
          lineTotal: 2000,
        },
      ],
      totalAmount: 1498,
      discountAmount: 500,
      adjustmentAmount: -2,
      lineItemCount: 1,
      notes: null,
      receivedAt: null,
      receivedBy: null,
      ...auditFields(),
    });

    await purchaseRepository.receive(ORG_A, 'pur-discount', USER);

    expect(read(ORG_A, 'rawMaterials', 'rm-flour')).toMatchObject({
      currentStock: 20,
      averageCost: 150,
    });
    expect(movements(ORG_A)).toEqual([
      expect.objectContaining({
        movementType: 'PURCHASE_IN',
        itemId: 'rm-flour',
        quantity: 10,
        unitCost: 200,
        totalCost: 2000,
        averageCostAfter: 150,
      }),
    ]);
  });

  it('duplicate purchase receive does not apply stock twice', async () => {
    seedRawMaterial(ORG_A, 'rm-flour', 10, 100);
    seed(ORG_A, 'purchases', 'pur-1', {
      organizationId: ORG_A,
      purchaseNumber: 'PUR-001',
      purchaseDate: '2026-08-14',
      supplierName: 'Mill',
      invoiceNumber: null,
      status: 'draft',
      paymentStatus: 'unpaid',
      lineItems: [
        {
          id: 'pl-1',
          rawMaterialId: 'rm-flour',
          rawMaterialCode: 'FL-1',
          rawMaterialName: 'Flour',
          quantity: 10,
          unit: 'kg',
          unitCost: 200,
          lineTotal: 2000,
        },
      ],
      totalAmount: 2000,
      lineItemCount: 1,
      notes: null,
      receivedAt: null,
      receivedBy: null,
      ...auditFields(),
    });

    await purchaseRepository.receive(ORG_A, 'pur-1', USER);

    await expect(purchaseRepository.receive(ORG_A, 'pur-1', USER)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'This purchase has already been received',
    });

    expect(read(ORG_A, 'rawMaterials', 'rm-flour')?.['currentStock']).toBe(20);
    expect(movements(ORG_A)).toHaveLength(1);
  });

  it('sale complete decreases product stock, writes SALE_OUT, and keeps averageCost', async () => {
    seedProduct(ORG_A, 'p-bread', 10, 300);
    seed(ORG_A, 'sales', 'sal-1', {
      organizationId: ORG_A,
      saleNumber: 'SAL-001',
      saleDate: '2026-08-14',
      customerId: null,
      customerNameSnapshot: null,
      status: 'draft',
      lines: [
        {
          id: 'sl-1',
          productId: 'p-bread',
          productNameSnapshot: 'Milk Bread',
          productCodeSnapshot: 'MB-1',
          sellingPriceSnapshot: 500,
          quantity: 4,
          unit: 'pcs',
          lineTotal: 2000,
        },
      ],
      subtotal: 2000,
      lineCount: 1,
      notes: null,
      completedAt: null,
      completedBy: null,
      ...auditFields(),
    });

    const completed = await saleRepository.complete(ORG_A, 'sal-1', USER);

    expect(completed.status).toBe('completed');
    expect(read(ORG_A, 'products', 'p-bread')).toMatchObject({
      currentStock: 6,
      averageCost: 300,
    });
    expect(movements(ORG_A)).toEqual([
      expect.objectContaining({
        movementType: 'SALE_OUT',
        itemId: 'p-bread',
        quantity: 4,
        balanceAfter: 6,
        averageCostAfter: 300,
      }),
    ]);
  });

  it('sale complete rejects insufficient stock and does not write a movement', async () => {
    seedProduct(ORG_A, 'p-bread', 3, 300);
    seed(ORG_A, 'sales', 'sal-1', {
      organizationId: ORG_A,
      saleNumber: 'SAL-001',
      saleDate: '2026-08-14',
      customerId: null,
      customerNameSnapshot: null,
      status: 'draft',
      lines: [
        {
          id: 'sl-1',
          productId: 'p-bread',
          productNameSnapshot: 'Milk Bread',
          productCodeSnapshot: 'MB-1',
          sellingPriceSnapshot: 500,
          quantity: 5,
          unit: 'pcs',
          lineTotal: 2500,
        },
      ],
      subtotal: 2500,
      lineCount: 1,
      notes: null,
      completedAt: null,
      completedBy: null,
      ...auditFields(),
    });

    await expect(saleRepository.complete(ORG_A, 'sal-1', USER)).rejects.toBeInstanceOf(DomainError);
    await expect(saleRepository.complete(ORG_A, 'sal-1', USER)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });

    expect(read(ORG_A, 'products', 'p-bread')?.['currentStock']).toBe(3);
    expect(movements(ORG_A)).toHaveLength(0);
    expect(read(ORG_A, 'sales', 'sal-1')?.['status']).toBe('draft');
  });

  it('duplicate sale complete does not apply stock twice', async () => {
    seedProduct(ORG_A, 'p-bread', 10, 300);
    seed(ORG_A, 'sales', 'sal-1', {
      organizationId: ORG_A,
      saleNumber: 'SAL-001',
      saleDate: '2026-08-14',
      customerId: null,
      customerNameSnapshot: null,
      status: 'draft',
      lines: [
        {
          id: 'sl-1',
          productId: 'p-bread',
          productNameSnapshot: 'Milk Bread',
          productCodeSnapshot: 'MB-1',
          sellingPriceSnapshot: 500,
          quantity: 4,
          unit: 'pcs',
          lineTotal: 2000,
        },
      ],
      subtotal: 2000,
      lineCount: 1,
      notes: null,
      completedAt: null,
      completedBy: null,
      ...auditFields(),
    });

    await saleRepository.complete(ORG_A, 'sal-1', USER);

    await expect(saleRepository.complete(ORG_A, 'sal-1', USER)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'This sale has already been completed',
    });

    expect(read(ORG_A, 'products', 'p-bread')?.['currentStock']).toBe(6);
    expect(movements(ORG_A)).toHaveLength(1);
  });

  it('two sequential sales cannot consume more stock than available', async () => {
    seedProduct(ORG_A, 'p-bread', 10, 300);

    const saleDoc = (id: string) => ({
      organizationId: ORG_A,
      saleNumber: id.toUpperCase(),
      saleDate: '2026-08-14',
      customerId: null,
      customerNameSnapshot: null,
      status: 'draft',
      lines: [
        {
          id: `${id}-line`,
          productId: 'p-bread',
          productNameSnapshot: 'Milk Bread',
          productCodeSnapshot: 'MB-1',
          sellingPriceSnapshot: 500,
          quantity: 6,
          unit: 'pcs',
          lineTotal: 3000,
        },
      ],
      subtotal: 3000,
      lineCount: 1,
      notes: null,
      completedAt: null,
      completedBy: null,
      ...auditFields(),
    });

    seed(ORG_A, 'sales', 'sal-1', saleDoc('sal-1'));
    seed(ORG_A, 'sales', 'sal-2', saleDoc('sal-2'));

    await saleRepository.complete(ORG_A, 'sal-1', USER);

    await expect(saleRepository.complete(ORG_A, 'sal-2', USER)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });

    expect(read(ORG_A, 'products', 'p-bread')?.['currentStock']).toBe(4);
    expect(movements(ORG_A)).toHaveLength(1);
  });

  it('production complete consumes raw materials and increases finished stock with movements', async () => {
    seedRawMaterial(ORG_A, 'rm-flour', 20, 50);
    seedProduct(ORG_A, 'p-bread', 0, 0);
    seed(ORG_A, 'recipes', 'rec-1', {
      productId: 'p-bread',
      batchOutputQuantity: 1,
      ingredients: [
        {
          rawMaterialId: 'rm-flour',
          rawMaterialName: 'Flour',
          quantity: 2,
          unit: 'kg',
        },
      ],
      isActive: true,
      deletedAt: null,
    });
    seed(ORG_A, 'production', 'prd-1', {
      organizationId: ORG_A,
      productionNumber: 'PRD-001',
      productionDate: '2026-08-14',
      status: 'draft',
      lines: [
        {
          id: 'prl-1',
          productId: 'p-bread',
          productCode: 'MB-1',
          productName: 'Milk Bread',
          quantity: 5,
          unit: 'pcs',
          recipeId: 'rec-1',
          recipeCode: 'R-1',
          recipeName: 'Milk Bread Recipe',
          recipeVersion: 1,
        },
      ],
      totalUnits: 5,
      lineCount: 1,
      notes: null,
      completedAt: null,
      completedBy: null,
      ...auditFields(),
    });

    await productionRepository.complete(ORG_A, 'prd-1', USER);

    expect(read(ORG_A, 'rawMaterials', 'rm-flour')).toMatchObject({
      currentStock: 10,
      averageCost: 50,
    });
    expect(read(ORG_A, 'products', 'p-bread')).toMatchObject({
      currentStock: 5,
      averageCost: 100,
    });
    expect(movements(ORG_A)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          movementType: 'PRODUCTION_RAW_OUT',
          itemId: 'rm-flour',
          quantity: 10,
          balanceAfter: 10,
        }),
        expect.objectContaining({
          movementType: 'PRODUCTION_FINISHED_IN',
          itemId: 'p-bread',
          quantity: 5,
          balanceAfter: 5,
          averageCostAfter: 100,
        }),
      ]),
    );
  });

  it('CASE D: completing after Use New Recipe consumes live V2 quantities', async () => {
    seedRawMaterial(ORG_A, 'rm-maida', 20, 50);
    seedProduct(ORG_A, 'p-cake', 0, 0);
    seed(ORG_A, 'recipes', 'rec-1', {
      productId: 'p-cake',
      batchOutputQuantity: 10,
      ingredients: [
        {
          rawMaterialId: 'rm-maida',
          rawMaterialName: 'Maida',
          quantity: 2,
          unit: 'kg',
        },
      ],
      isActive: true,
      deletedAt: null,
    });
    seed(ORG_A, 'production', 'prd-new', {
      organizationId: ORG_A,
      productionNumber: 'PRD-NEW',
      productionDate: '2026-08-16',
      status: 'draft',
      acceptedStaleRecipe: false,
      lines: [
        {
          id: 'prl-1',
          productId: 'p-cake',
          productCode: 'CK-1',
          productName: 'Cake',
          quantity: 10,
          unit: 'pcs',
          recipeId: 'rec-1',
          recipeCode: 'R-1',
          recipeName: 'Cake Recipe',
          recipeVersion: 2,
          recipeBatchOutputQuantity: 10,
          recipeIngredients: [
            {
              rawMaterialId: 'rm-maida',
              rawMaterialName: 'Maida',
              quantity: 2,
              unit: 'kg',
            },
          ],
        },
      ],
      totalUnits: 10,
      lineCount: 1,
      notes: null,
      completedAt: null,
      completedBy: null,
      ...auditFields(),
    });

    await productionRepository.complete(ORG_A, 'prd-new', USER);

    expect(read(ORG_A, 'rawMaterials', 'rm-maida')).toMatchObject({
      currentStock: 18,
      averageCost: 50,
    });
    expect(read(ORG_A, 'products', 'p-cake')).toMatchObject({
      currentStock: 10,
    });
    expect(read(ORG_A, 'production', 'prd-new')).toMatchObject({
      status: 'completed',
    });
  });

  it('Keep Current complete consumes V1 snapshot while live recipe is V2', async () => {
    seedRawMaterial(ORG_A, 'rm-maida', 20, 50);
    seedProduct(ORG_A, 'p-cake', 0, 0);
    seed(ORG_A, 'recipes', 'rec-1', {
      productId: 'p-cake',
      batchOutputQuantity: 10,
      ingredients: [
        {
          rawMaterialId: 'rm-maida',
          rawMaterialName: 'Maida',
          quantity: 2,
          unit: 'kg',
        },
      ],
      isActive: true,
      deletedAt: null,
    });
    seed(ORG_A, 'production', 'prd-keep', {
      organizationId: ORG_A,
      productionNumber: 'PRD-KEEP',
      productionDate: '2026-08-16',
      status: 'draft',
      acceptedStaleRecipe: true,
      lines: [
        {
          id: 'prl-1',
          productId: 'p-cake',
          productCode: 'CK-1',
          productName: 'Cake',
          quantity: 10,
          unit: 'pcs',
          recipeId: 'rec-1',
          recipeCode: 'R-1',
          recipeName: 'Cake Recipe',
          recipeVersion: 1,
          recipeBatchOutputQuantity: 10,
          recipeIngredients: [
            {
              rawMaterialId: 'rm-maida',
              rawMaterialName: 'Maida',
              quantity: 1,
              unit: 'kg',
            },
          ],
        },
      ],
      totalUnits: 10,
      lineCount: 1,
      notes: null,
      completedAt: null,
      completedBy: null,
      ...auditFields(),
    });

    await productionRepository.complete(ORG_A, 'prd-keep', USER);

    expect(read(ORG_A, 'rawMaterials', 'rm-maida')).toMatchObject({
      currentStock: 19,
      averageCost: 50,
    });
    expect(movements(ORG_A)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          movementType: 'PRODUCTION_RAW_OUT',
          itemId: 'rm-maida',
          quantity: 1,
        }),
      ]),
    );
  });

  it('draft recipe-version updates do not consume inventory or change WAC', async () => {
    seedRawMaterial(ORG_A, 'rm-maida', 20, 50);
    seedProduct(ORG_A, 'p-cake', 0, 0);
    seed(ORG_A, 'production', 'prd-draft', {
      organizationId: ORG_A,
      productionNumber: 'PRD-DRAFT',
      productionDate: '2026-08-16',
      status: 'draft',
      acceptedStaleRecipe: false,
      lines: [
        {
          id: 'prl-1',
          productId: 'p-cake',
          productCode: 'CK-1',
          productName: 'Cake',
          quantity: 10,
          unit: 'pcs',
          recipeId: 'rec-1',
          recipeCode: 'R-1',
          recipeName: 'Cake Recipe',
          recipeVersion: 1,
          recipeBatchOutputQuantity: 10,
          recipeIngredients: [
            {
              rawMaterialId: 'rm-maida',
              rawMaterialName: 'Maida',
              quantity: 1,
              unit: 'kg',
            },
          ],
        },
      ],
      totalUnits: 10,
      lineCount: 1,
      notes: null,
      completedAt: null,
      completedBy: null,
      ...auditFields(),
    });

    await productionRepository.update(
      ORG_A,
      'prd-draft',
      { acceptedStaleRecipe: true },
      USER,
    );

    expect(read(ORG_A, 'production', 'prd-draft')).toMatchObject({
      status: 'draft',
      acceptedStaleRecipe: true,
    });
    expect(read(ORG_A, 'rawMaterials', 'rm-maida')).toMatchObject({
      currentStock: 20,
      averageCost: 50,
    });
    expect(read(ORG_A, 'products', 'p-cake')).toMatchObject({
      currentStock: 0,
      averageCost: 0,
    });
    expect(movements(ORG_A)).toHaveLength(0);
  });

  it('purchase receive then production consume the same raw material sequentially', async () => {
    seedRawMaterial(ORG_A, 'rm-flour', 0, 0);
    seedProduct(ORG_A, 'p-bread', 0, 0);
    seed(ORG_A, 'recipes', 'rec-1', {
      productId: 'p-bread',
      batchOutputQuantity: 1,
      ingredients: [
        {
          rawMaterialId: 'rm-flour',
          rawMaterialName: 'Flour',
          quantity: 2,
          unit: 'kg',
        },
      ],
      isActive: true,
      deletedAt: null,
    });
    seed(ORG_A, 'purchases', 'pur-1', {
      organizationId: ORG_A,
      purchaseNumber: 'PUR-001',
      purchaseDate: '2026-08-14',
      supplierName: 'Mill',
      invoiceNumber: null,
      status: 'draft',
      paymentStatus: 'unpaid',
      lineItems: [
        {
          id: 'pl-1',
          rawMaterialId: 'rm-flour',
          rawMaterialCode: 'FL-1',
          rawMaterialName: 'Flour',
          quantity: 20,
          unit: 'kg',
          unitCost: 50,
          lineTotal: 1000,
        },
      ],
      totalAmount: 1000,
      lineItemCount: 1,
      notes: null,
      receivedAt: null,
      receivedBy: null,
      ...auditFields(),
    });
    seed(ORG_A, 'production', 'prd-1', {
      organizationId: ORG_A,
      productionNumber: 'PRD-001',
      productionDate: '2026-08-14',
      status: 'draft',
      lines: [
        {
          id: 'prl-1',
          productId: 'p-bread',
          productCode: 'MB-1',
          productName: 'Milk Bread',
          quantity: 5,
          unit: 'pcs',
          recipeId: 'rec-1',
          recipeCode: 'R-1',
          recipeName: 'Milk Bread Recipe',
          recipeVersion: 1,
        },
      ],
      totalUnits: 5,
      lineCount: 1,
      notes: null,
      completedAt: null,
      completedBy: null,
      ...auditFields(),
    });

    await purchaseRepository.receive(ORG_A, 'pur-1', USER);
    await productionRepository.complete(ORG_A, 'prd-1', USER);

    expect(read(ORG_A, 'rawMaterials', 'rm-flour')?.['currentStock']).toBe(10);
    expect(movements(ORG_A).map((row) => row['movementType'])).toEqual([
      'PURCHASE_IN',
      'PRODUCTION_RAW_OUT',
      'PRODUCTION_FINISHED_IN',
    ]);
  });

  it('second production complete cannot consume the same raw material twice past zero', async () => {
    seedRawMaterial(ORG_A, 'rm-flour', 10, 50);
    seedProduct(ORG_A, 'p-bread', 0, 0);
    seed(ORG_A, 'recipes', 'rec-1', {
      productId: 'p-bread',
      batchOutputQuantity: 1,
      ingredients: [
        {
          rawMaterialId: 'rm-flour',
          rawMaterialName: 'Flour',
          quantity: 2,
          unit: 'kg',
        },
      ],
      isActive: true,
      deletedAt: null,
    });

    const productionDoc = (id: string) => ({
      organizationId: ORG_A,
      productionNumber: id.toUpperCase(),
      productionDate: '2026-08-14',
      status: 'draft',
      lines: [
        {
          id: `${id}-line`,
          productId: 'p-bread',
          productCode: 'MB-1',
          productName: 'Milk Bread',
          quantity: 5,
          unit: 'pcs',
          recipeId: 'rec-1',
          recipeCode: 'R-1',
          recipeName: 'Milk Bread Recipe',
          recipeVersion: 1,
        },
      ],
      totalUnits: 5,
      lineCount: 1,
      notes: null,
      completedAt: null,
      completedBy: null,
      ...auditFields(),
    });

    seed(ORG_A, 'production', 'prd-1', productionDoc('prd-1'));
    seed(ORG_A, 'production', 'prd-2', productionDoc('prd-2'));

    await productionRepository.complete(ORG_A, 'prd-1', USER);

    await expect(productionRepository.complete(ORG_A, 'prd-2', USER)).rejects.toBeInstanceOf(
      DomainError,
    );

    expect(read(ORG_A, 'rawMaterials', 'rm-flour')?.['currentStock']).toBe(0);
    expect(read(ORG_A, 'products', 'p-bread')?.['currentStock']).toBe(5);
    expect(movements(ORG_A)).toHaveLength(2);
  });

  it('duplicate production complete does not apply stock twice', async () => {
    seedRawMaterial(ORG_A, 'rm-flour', 20, 50);
    seedProduct(ORG_A, 'p-bread', 0, 0);
    seed(ORG_A, 'recipes', 'rec-1', {
      productId: 'p-bread',
      batchOutputQuantity: 1,
      ingredients: [
        {
          rawMaterialId: 'rm-flour',
          rawMaterialName: 'Flour',
          quantity: 2,
          unit: 'kg',
        },
      ],
      isActive: true,
      deletedAt: null,
    });
    seed(ORG_A, 'production', 'prd-1', {
      organizationId: ORG_A,
      productionNumber: 'PRD-001',
      productionDate: '2026-08-14',
      status: 'draft',
      lines: [
        {
          id: 'prl-1',
          productId: 'p-bread',
          productCode: 'MB-1',
          productName: 'Milk Bread',
          quantity: 5,
          unit: 'pcs',
          recipeId: 'rec-1',
          recipeCode: 'R-1',
          recipeName: 'Milk Bread Recipe',
          recipeVersion: 1,
        },
      ],
      totalUnits: 5,
      lineCount: 1,
      notes: null,
      completedAt: null,
      completedBy: null,
      ...auditFields(),
    });

    await productionRepository.complete(ORG_A, 'prd-1', USER);

    await expect(productionRepository.complete(ORG_A, 'prd-1', USER)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'This production has already been completed',
    });

    expect(read(ORG_A, 'rawMaterials', 'rm-flour')?.['currentStock']).toBe(10);
    expect(read(ORG_A, 'products', 'p-bread')?.['currentStock']).toBe(5);
    expect(movements(ORG_A)).toHaveLength(2);
  });

  it('insufficient raw material rejects and does not change stock or write movements', async () => {
    seedRawMaterial(ORG_A, 'rm-flour', 9, 50);
    seedProduct(ORG_A, 'p-bread', 3, 200);
    seed(ORG_A, 'recipes', 'rec-1', {
      productId: 'p-bread',
      batchOutputQuantity: 1,
      ingredients: [
        {
          rawMaterialId: 'rm-flour',
          rawMaterialName: 'Flour',
          quantity: 2,
          unit: 'kg',
        },
      ],
      isActive: true,
      deletedAt: null,
    });
    seed(ORG_A, 'production', 'prd-1', {
      organizationId: ORG_A,
      productionNumber: 'PRD-001',
      productionDate: '2026-08-14',
      status: 'draft',
      lines: [
        {
          id: 'prl-1',
          productId: 'p-bread',
          productCode: 'MB-1',
          productName: 'Milk Bread',
          quantity: 5,
          unit: 'pcs',
          recipeId: 'rec-1',
          recipeCode: 'R-1',
          recipeName: 'Milk Bread Recipe',
          recipeVersion: 1,
        },
      ],
      totalUnits: 5,
      lineCount: 1,
      notes: null,
      completedAt: null,
      completedBy: null,
      ...auditFields(),
    });

    await expect(productionRepository.complete(ORG_A, 'prd-1', USER)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });

    expect(read(ORG_A, 'rawMaterials', 'rm-flour')).toMatchObject({
      currentStock: 9,
      averageCost: 50,
    });
    expect(read(ORG_A, 'products', 'p-bread')).toMatchObject({
      currentStock: 3,
      averageCost: 200,
    });
    expect(read(ORG_A, 'production', 'prd-1')?.['status']).toBe('draft');
    expect(movements(ORG_A)).toHaveLength(0);
  });

  it('production WAC blends existing finished-goods average cost', async () => {
    seedRawMaterial(ORG_A, 'rm-flour', 30, 1500);
    seedProduct(ORG_A, 'p-bread', 10, 2000);
    seed(ORG_A, 'recipes', 'rec-1', {
      productId: 'p-bread',
      batchOutputQuantity: 1,
      ingredients: [
        {
          rawMaterialId: 'rm-flour',
          rawMaterialName: 'Flour',
          quantity: 2,
          unit: 'kg',
        },
      ],
      isActive: true,
      deletedAt: null,
    });
    seed(ORG_A, 'production', 'prd-1', {
      organizationId: ORG_A,
      productionNumber: 'PRD-001',
      productionDate: '2026-08-14',
      status: 'draft',
      lines: [
        {
          id: 'prl-1',
          productId: 'p-bread',
          productCode: 'MB-1',
          productName: 'Milk Bread',
          quantity: 10,
          unit: 'pcs',
          recipeId: 'rec-1',
          recipeCode: 'R-1',
          recipeName: 'Milk Bread Recipe',
          recipeVersion: 1,
        },
      ],
      totalUnits: 10,
      lineCount: 1,
      notes: null,
      completedAt: null,
      completedBy: null,
      ...auditFields(),
    });

    await productionRepository.complete(ORG_A, 'prd-1', USER);

    expect(read(ORG_A, 'rawMaterials', 'rm-flour')?.['currentStock']).toBe(10);
    expect(read(ORG_A, 'products', 'p-bread')).toMatchObject({
      currentStock: 20,
      averageCost: 2500,
    });
  });

  it('completing production in org-a does not change org-b inventory', async () => {
    seedRawMaterial(ORG_A, 'rm-flour', 20, 50);
    seedProduct(ORG_A, 'p-bread', 0, 0);
    seedRawMaterial(ORG_B, 'rm-flour', 99, 900);
    seedProduct(ORG_B, 'p-bread', 40, 700, { name: 'Org B Bread' });
    seed(ORG_A, 'recipes', 'rec-1', {
      productId: 'p-bread',
      batchOutputQuantity: 1,
      ingredients: [
        {
          rawMaterialId: 'rm-flour',
          rawMaterialName: 'Flour',
          quantity: 2,
          unit: 'kg',
        },
      ],
      isActive: true,
      deletedAt: null,
    });
    seed(ORG_A, 'production', 'prd-1', {
      organizationId: ORG_A,
      productionNumber: 'PRD-001',
      productionDate: '2026-08-14',
      status: 'draft',
      lines: [
        {
          id: 'prl-1',
          productId: 'p-bread',
          productCode: 'MB-1',
          productName: 'Milk Bread',
          quantity: 5,
          unit: 'pcs',
          recipeId: 'rec-1',
          recipeCode: 'R-1',
          recipeName: 'Milk Bread Recipe',
          recipeVersion: 1,
        },
      ],
      totalUnits: 5,
      lineCount: 1,
      notes: null,
      completedAt: null,
      completedBy: null,
      ...auditFields(),
    });

    await productionRepository.complete(ORG_A, 'prd-1', USER);

    expect(read(ORG_A, 'rawMaterials', 'rm-flour')?.['currentStock']).toBe(10);
    expect(read(ORG_A, 'products', 'p-bread')?.['currentStock']).toBe(5);
    expect(read(ORG_B, 'rawMaterials', 'rm-flour')).toMatchObject({
      currentStock: 99,
      averageCost: 900,
    });
    expect(read(ORG_B, 'products', 'p-bread')).toMatchObject({
      currentStock: 40,
      averageCost: 700,
    });
    expect(movements(ORG_B)).toHaveLength(0);
  });

  it('production complete batches recipe/product/raw-material reads via getAll', async () => {
    seedRawMaterial(ORG_A, 'rm-flour', 50, 50);
    seedRawMaterial(ORG_A, 'rm-sugar', 50, 40);
    seedProduct(ORG_A, 'p-bread', 0, 0);
    seedProduct(ORG_A, 'p-cake', 0, 0, { name: 'Cake', code: 'CK-1' });
    seed(ORG_A, 'recipes', 'rec-bread', {
      productId: 'p-bread',
      batchOutputQuantity: 10,
      ingredients: [
        { rawMaterialId: 'rm-flour', rawMaterialName: 'Flour', quantity: 1, unit: 'kg' },
      ],
      isActive: true,
      deletedAt: null,
    });
    seed(ORG_A, 'recipes', 'rec-cake', {
      productId: 'p-cake',
      batchOutputQuantity: 10,
      ingredients: [
        { rawMaterialId: 'rm-flour', rawMaterialName: 'Flour', quantity: 2, unit: 'kg' },
        { rawMaterialId: 'rm-sugar', rawMaterialName: 'Sugar', quantity: 1, unit: 'kg' },
      ],
      isActive: true,
      deletedAt: null,
    });
    seed(ORG_A, 'production', 'prd-multi', {
      organizationId: ORG_A,
      productionNumber: 'PRD-010',
      productionDate: '2026-08-16',
      status: 'draft',
      lines: [
        {
          id: 'prl-1',
          productId: 'p-bread',
          productCode: 'MB-1',
          productName: 'Milk Bread',
          quantity: 10,
          unit: 'pcs',
          recipeId: 'rec-bread',
          recipeCode: 'R-B',
          recipeName: 'Bread Recipe',
          recipeVersion: 1,
        },
        {
          id: 'prl-2',
          productId: 'p-cake',
          productCode: 'CK-1',
          productName: 'Cake',
          quantity: 10,
          unit: 'pcs',
          recipeId: 'rec-cake',
          recipeCode: 'R-C',
          recipeName: 'Cake Recipe',
          recipeVersion: 1,
        },
      ],
      totalUnits: 20,
      lineCount: 2,
      notes: null,
      completedAt: null,
      completedBy: null,
      ...auditFields(),
    });

    await productionRepository.complete(ORG_A, 'prd-multi', USER);

    expect(harness.current?.stats.getCalls).toBe(1);
    expect(harness.current?.stats.getAllCalls).toBe(2);
    expect(harness.current?.stats.getAllRefCounts).toEqual([4, 2]);
    expect(read(ORG_A, 'rawMaterials', 'rm-flour')).toMatchObject({ currentStock: 47 });
    expect(read(ORG_A, 'rawMaterials', 'rm-sugar')).toMatchObject({ currentStock: 49 });
    expect(read(ORG_A, 'products', 'p-bread')).toMatchObject({ currentStock: 10 });
    expect(read(ORG_A, 'products', 'p-cake')).toMatchObject({ currentStock: 10 });
    expect(read(ORG_A, 'production', 'prd-multi')).toMatchObject({ status: 'completed' });
    expect(movements(ORG_A)).toHaveLength(5);
  });

  it('production complete rejects a missing recipe without writing stock', async () => {
    seedRawMaterial(ORG_A, 'rm-flour', 20, 50);
    seedProduct(ORG_A, 'p-bread', 0, 0);
    seed(ORG_A, 'production', 'prd-1', {
      organizationId: ORG_A,
      productionNumber: 'PRD-001',
      productionDate: '2026-08-14',
      status: 'draft',
      lines: [
        {
          id: 'prl-1',
          productId: 'p-bread',
          productCode: 'MB-1',
          productName: 'Milk Bread',
          quantity: 5,
          unit: 'pcs',
          recipeId: 'rec-missing',
          recipeCode: 'R-1',
          recipeName: 'Missing',
          recipeVersion: 1,
        },
      ],
      totalUnits: 5,
      lineCount: 1,
      notes: null,
      completedAt: null,
      completedBy: null,
      ...auditFields(),
    });

    await expect(productionRepository.complete(ORG_A, 'prd-1', USER)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'One or more recipes were not found',
    });
    expect(read(ORG_A, 'rawMaterials', 'rm-flour')?.['currentStock']).toBe(20);
    expect(movements(ORG_A)).toHaveLength(0);
  });

  it('production complete rejects a missing raw material without writing stock', async () => {
    seedProduct(ORG_A, 'p-bread', 0, 0);
    seed(ORG_A, 'recipes', 'rec-1', {
      productId: 'p-bread',
      batchOutputQuantity: 1,
      ingredients: [
        { rawMaterialId: 'rm-missing', rawMaterialName: 'Ghost', quantity: 1, unit: 'kg' },
      ],
      isActive: true,
      deletedAt: null,
    });
    seed(ORG_A, 'production', 'prd-1', {
      organizationId: ORG_A,
      productionNumber: 'PRD-001',
      productionDate: '2026-08-14',
      status: 'draft',
      lines: [
        {
          id: 'prl-1',
          productId: 'p-bread',
          productCode: 'MB-1',
          productName: 'Milk Bread',
          quantity: 1,
          unit: 'pcs',
          recipeId: 'rec-1',
          recipeCode: 'R-1',
          recipeName: 'Recipe',
          recipeVersion: 1,
        },
      ],
      totalUnits: 1,
      lineCount: 1,
      notes: null,
      completedAt: null,
      completedBy: null,
      ...auditFields(),
    });

    await expect(productionRepository.complete(ORG_A, 'prd-1', USER)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'One or more raw materials were not found',
    });
    expect(read(ORG_A, 'products', 'p-bread')?.['currentStock']).toBe(0);
    expect(movements(ORG_A)).toHaveLength(0);
  });

  it('production complete rejects a missing finished product without writing stock', async () => {
    seedRawMaterial(ORG_A, 'rm-flour', 20, 50);
    seed(ORG_A, 'recipes', 'rec-1', {
      productId: 'p-missing',
      batchOutputQuantity: 1,
      ingredients: [
        { rawMaterialId: 'rm-flour', rawMaterialName: 'Flour', quantity: 1, unit: 'kg' },
      ],
      isActive: true,
      deletedAt: null,
    });
    seed(ORG_A, 'production', 'prd-1', {
      organizationId: ORG_A,
      productionNumber: 'PRD-001',
      productionDate: '2026-08-14',
      status: 'draft',
      lines: [
        {
          id: 'prl-1',
          productId: 'p-missing',
          productCode: 'MB-1',
          productName: 'Missing',
          quantity: 1,
          unit: 'pcs',
          recipeId: 'rec-1',
          recipeCode: 'R-1',
          recipeName: 'Recipe',
          recipeVersion: 1,
        },
      ],
      totalUnits: 1,
      lineCount: 1,
      notes: null,
      completedAt: null,
      completedBy: null,
      ...auditFields(),
    });

    await expect(productionRepository.complete(ORG_A, 'prd-1', USER)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'One or more products were not found',
    });
    expect(read(ORG_A, 'rawMaterials', 'rm-flour')?.['currentStock']).toBe(20);
    expect(movements(ORG_A)).toHaveLength(0);
  });

  it('wastage complete decreases product stock and writes WASTAGE_OUT', async () => {
    seedProduct(ORG_A, 'p-bread', 10, 300);
    seed(ORG_A, 'wastage', 'was-1', {
      organizationId: ORG_A,
      wastageNumber: 'WAS-001',
      wastageDate: '2026-08-14',
      reason: 'damaged',
      status: 'draft',
      lines: [
        {
          id: 'wl-1',
          productId: 'p-bread',
          productNameSnapshot: 'Milk Bread',
          productCodeSnapshot: 'MB-1',
          quantity: 3,
          unit: 'pcs',
        },
      ],
      lineCount: 1,
      totalUnits: 3,
      notes: null,
      completedAt: null,
      completedBy: null,
      ...auditFields(),
    });

    await wastageRepository.complete(ORG_A, 'was-1', USER);

    expect(read(ORG_A, 'products', 'p-bread')).toMatchObject({
      currentStock: 7,
      averageCost: 300,
    });
    expect(movements(ORG_A)).toEqual([
      expect.objectContaining({
        movementType: 'WASTAGE_OUT',
        quantity: 3,
        balanceAfter: 7,
      }),
    ]);
  });

  it('return complete increases product stock, writes RETURN_IN, and keeps averageCost', async () => {
    seedProduct(ORG_A, 'p-bread', 10, 300);
    seed(ORG_A, 'returns', 'ret-1', {
      organizationId: ORG_A,
      returnNumber: 'RET-001',
      returnDate: '2026-08-14',
      reason: 'unsold',
      status: 'draft',
      lines: [
        {
          id: 'rl-1',
          productId: 'p-bread',
          productNameSnapshot: 'Milk Bread',
          productCodeSnapshot: 'MB-1',
          quantity: 2,
          unit: 'pcs',
        },
      ],
      lineCount: 1,
      totalUnits: 2,
      notes: null,
      completedAt: null,
      completedBy: null,
      ...auditFields(),
    });

    await returnRepository.complete(ORG_A, 'ret-1', USER);

    expect(read(ORG_A, 'products', 'p-bread')).toMatchObject({
      currentStock: 12,
      averageCost: 300,
    });
    expect(movements(ORG_A)).toEqual([
      expect.objectContaining({
        movementType: 'RETURN_IN',
        quantity: 2,
        balanceAfter: 12,
        averageCostAfter: 300,
      }),
    ]);
  });

  it('completing a sale in org-a does not change org-b inventory', async () => {
    seedProduct(ORG_A, 'p-bread', 10, 300);
    seedProduct(ORG_B, 'p-bread', 99, 900, { name: 'Org B Bread' });
    seed(ORG_A, 'sales', 'sal-1', {
      organizationId: ORG_A,
      saleNumber: 'SAL-001',
      saleDate: '2026-08-14',
      customerId: null,
      customerNameSnapshot: null,
      status: 'draft',
      lines: [
        {
          id: 'sl-1',
          productId: 'p-bread',
          productNameSnapshot: 'Milk Bread',
          productCodeSnapshot: 'MB-1',
          sellingPriceSnapshot: 500,
          quantity: 4,
          unit: 'pcs',
          lineTotal: 2000,
        },
      ],
      subtotal: 2000,
      lineCount: 1,
      notes: null,
      completedAt: null,
      completedBy: null,
      ...auditFields(),
    });

    await saleRepository.complete(ORG_A, 'sal-1', USER);

    expect(read(ORG_A, 'products', 'p-bread')?.['currentStock']).toBe(6);
    expect(read(ORG_B, 'products', 'p-bread')).toMatchObject({
      currentStock: 99,
      averageCost: 900,
    });
    expect(movements(ORG_B)).toHaveLength(0);
    expect(movements(ORG_A)).toHaveLength(1);
  });
});
