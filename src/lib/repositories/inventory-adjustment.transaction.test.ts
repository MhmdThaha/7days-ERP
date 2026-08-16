/**
 * Inventory adjustment transactions.
 * Sequential duplicate complete/confirm is proven locally.
 * Real multi-client Firestore contention is NOT TESTED.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

  function collectionAt(basePath: string): CollectionRef {
    return {
      doc(id?: string): DocRef {
        const docId = id ?? `auto-${++autoId}`;
        const path = `${basePath}/${docId}`;

        return {
          id: docId,
          path,
          collection: (name: string) => collectionAt(`${path}/${name}`),
          get: async () => {
            const data = docs.get(path);

            return {
              exists: data !== undefined,
              id: docId,
              data: () => data,
            };
          },
          set: async (data: Record<string, unknown>) => {
            docs.set(path, { ...data });
          },
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
        set: (ref: DocRef, data: Record<string, unknown>) => void;
        update: (ref: DocRef, data: Record<string, unknown>) => void;
      }) => Promise<T>,
    ): Promise<T> {
      const pending: Array<
        | { kind: 'set'; path: string; data: Record<string, unknown> }
        | { kind: 'update'; path: string; data: Record<string, unknown> }
      > = [];

      const result = await fn({
        get: async (ref) => {
          const data = docs.get(ref.path);

          return {
            exists: data !== undefined,
            id: ref.id,
            data: () => data,
          };
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

  return { db, docs };
}

const harness = vi.hoisted(() => ({
  current: null as { db: unknown; docs: Map<string, Record<string, unknown>> } | null,
}));

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => {
    if (!harness.current) {
      throw new Error('In-memory Firestore was not initialized');
    }

    return harness.current.db;
  },
}));

import { inventoryAdjustmentRepository } from '@/lib/repositories/inventory-adjustment.repository';

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

function seedProduct(orgId: string, id: string, stock: number, averageCost: number) {
  seed(orgId, 'products', id, {
    organizationId: orgId,
    name: 'Milk Bread',
    code: 'MB-1',
    unit: 'pcs',
    isActive: true,
    currentStock: stock,
    averageCost,
    ...auditFields(),
  });
}

function seedRawMaterial(orgId: string, id: string, stock: number, averageCost: number) {
  seed(orgId, 'rawMaterials', id, {
    organizationId: orgId,
    name: 'Maida',
    code: 'MD-1',
    unit: 'kg',
    isActive: true,
    currentStock: stock,
    averageCost,
    ...auditFields(),
  });
}

describe('inventory adjustment transactions', () => {
  beforeEach(() => {
    harness.current = createInMemoryFirestore();
  });

  it('ADJUSTMENT_OUT: 50 → 47 creates a positive-qty OUT movement and keeps averageCost', async () => {
    seedRawMaterial(ORG_A, 'rm-maida', 50, 4000);

    const result = await inventoryAdjustmentRepository.confirm(
      ORG_A,
      {
        itemType: 'raw_material',
        itemId: 'rm-maida',
        physicalCount: 47,
        reason: 'physical_stock_count',
        notes: '3 kg difference found',
      },
      USER,
    );

    expect(result.movementType).toBe('ADJUSTMENT_OUT');
    expect(result.quantityDifference).toBe(-3);
    expect(read(ORG_A, 'rawMaterials', 'rm-maida')).toMatchObject({
      currentStock: 47,
      averageCost: 4000,
    });
    expect(movements(ORG_A)).toEqual([
      expect.objectContaining({
        movementType: 'ADJUSTMENT_OUT',
        quantity: 3,
        unitCost: 4000,
        totalCost: 12000,
        balanceAfter: 47,
        averageCostAfter: 4000,
        sourceDocumentType: 'adjustment',
        organizationId: ORG_A,
      }),
    ]);
  });

  it('ADJUSTMENT_IN: 20 → 25 uses existing average cost', async () => {
    seedRawMaterial(ORG_A, 'rm-sugar', 20, 4000);

    const result = await inventoryAdjustmentRepository.confirm(
      ORG_A,
      {
        itemType: 'raw_material',
        itemId: 'rm-sugar',
        physicalCount: 25,
        reason: 'physical_stock_count',
      },
      USER,
    );

    expect(result.movementType).toBe('ADJUSTMENT_IN');
    expect(result.quantityDifference).toBe(5);
    expect(read(ORG_A, 'rawMaterials', 'rm-sugar')).toMatchObject({
      currentStock: 25,
      averageCost: 4000,
    });
    expect(movements(ORG_A)).toEqual([
      expect.objectContaining({
        movementType: 'ADJUSTMENT_IN',
        quantity: 5,
        unitCost: 4000,
        totalCost: 20000,
        averageCostAfter: 4000,
      }),
    ]);
  });

  it('rejects zero-cost IN and does not write stock or a movement', async () => {
    seedProduct(ORG_A, 'p-new', 0, 0);

    await expect(
      inventoryAdjustmentRepository.confirm(
        ORG_A,
        {
          itemType: 'finished_product',
          itemId: 'p-new',
          physicalCount: 8,
          reason: 'physical_stock_count',
        },
        USER,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    expect(read(ORG_A, 'products', 'p-new')?.['currentStock']).toBe(0);
    expect(movements(ORG_A)).toHaveLength(0);
  });

  it('rejects a zero difference', async () => {
    seedProduct(ORG_A, 'p-bread', 50, 300);

    await expect(
      inventoryAdjustmentRepository.confirm(
        ORG_A,
        {
          itemType: 'finished_product',
          itemId: 'p-bread',
          physicalCount: 50,
          reason: 'physical_stock_count',
        },
        USER,
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Physical count matches current stock. Nothing to adjust.',
    });

    expect(read(ORG_A, 'products', 'p-bread')?.['currentStock']).toBe(50);
    expect(movements(ORG_A)).toHaveLength(0);
  });

  it('rejects a negative physical count', async () => {
    seedProduct(ORG_A, 'p-bread', 10, 300);

    await expect(
      inventoryAdjustmentRepository.confirm(
        ORG_A,
        {
          itemType: 'finished_product',
          itemId: 'p-bread',
          physicalCount: -1,
          reason: 'physical_stock_count',
        },
        USER,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    expect(read(ORG_A, 'products', 'p-bread')?.['currentStock']).toBe(10);
    expect(movements(ORG_A)).toHaveLength(0);
  });

  it('duplicate complete of the same draft applies stock once', async () => {
    seedProduct(ORG_A, 'p-bread', 50, 300);

    const draft = await inventoryAdjustmentRepository.createDraft(
      ORG_A,
      {
        itemType: 'finished_product',
        itemId: 'p-bread',
        physicalCount: 47,
        reason: 'data_correction',
      },
      USER,
    );

    await inventoryAdjustmentRepository.complete(ORG_A, draft.id, USER);

    await expect(inventoryAdjustmentRepository.complete(ORG_A, draft.id, USER)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'This inventory adjustment has already been completed',
    });

    expect(read(ORG_A, 'products', 'p-bread')?.['currentStock']).toBe(47);
    expect(movements(ORG_A)).toHaveLength(1);
  });

  it('retrying the same physical count after confirm is a zero-difference reject', async () => {
    seedRawMaterial(ORG_A, 'rm-maida', 50, 4000);

    await inventoryAdjustmentRepository.confirm(
      ORG_A,
      {
        itemType: 'raw_material',
        itemId: 'rm-maida',
        physicalCount: 47,
        reason: 'physical_stock_count',
      },
      USER,
    );

    await expect(
      inventoryAdjustmentRepository.confirm(
        ORG_A,
        {
          itemType: 'raw_material',
          itemId: 'rm-maida',
          physicalCount: 47,
          reason: 'physical_stock_count',
        },
        USER,
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Physical count matches current stock. Nothing to adjust.',
    });

    expect(read(ORG_A, 'rawMaterials', 'rm-maida')?.['currentStock']).toBe(47);
    expect(movements(ORG_A)).toHaveLength(1);
  });

  it('does not change org B when confirming in org A', async () => {
    seedProduct(ORG_A, 'p-bread', 50, 300);
    seedProduct(ORG_B, 'p-bread', 99, 900);

    await inventoryAdjustmentRepository.confirm(
      ORG_A,
      {
        itemType: 'finished_product',
        itemId: 'p-bread',
        physicalCount: 47,
        reason: 'physical_stock_count',
      },
      USER,
    );

    expect(read(ORG_A, 'products', 'p-bread')?.['currentStock']).toBe(47);
    expect(read(ORG_B, 'products', 'p-bread')).toMatchObject({
      currentStock: 99,
      averageCost: 900,
    });
    expect(movements(ORG_B)).toHaveLength(0);
  });

  it('adjusts a finished product', async () => {
    seedProduct(ORG_A, 'p-bread', 10, 250);

    await inventoryAdjustmentRepository.confirm(
      ORG_A,
      {
        itemType: 'finished_product',
        itemId: 'p-bread',
        physicalCount: 8,
        reason: 'damage',
      },
      USER,
    );

    expect(read(ORG_A, 'products', 'p-bread')?.['currentStock']).toBe(8);
    expect(movements(ORG_A)[0]?.['itemType']).toBe('finished_product');
  });
});
