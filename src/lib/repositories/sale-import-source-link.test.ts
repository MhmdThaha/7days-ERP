/**
 * Sales Import source-sale link: create once, retry reuses the same Sale.
 * In-memory Firestore only — no production Firebase.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainError } from '@/lib/domain/errors';

type DocMap = Map<string, Record<string, unknown>>;

type DocRef = {
  id: string;
  path: string;
  collection: (name: string) => CollectionRef;
  get: () => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
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
            return { exists: data !== undefined, data: () => data };
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
          return { exists: data !== undefined, id: ref.id, data: () => data };
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

        const next = { ...previous };

        for (const [key, value] of Object.entries(write.data)) {
          const unionElements =
            (value as { _elements?: unknown[]; elements?: unknown[] } | null)?._elements ??
            (value as { elements?: unknown[] } | null)?.elements;

          if (Array.isArray(unionElements)) {
            const current = Array.isArray(next[key]) ? [...(next[key] as unknown[])] : [];
            next[key] = [...new Set([...current, ...unionElements])];
          } else {
            next[key] = value;
          }
        }

        docs.set(write.path, next);
      }

      return result;
    },
  };

  return { db, docs };
}

const harness = vi.hoisted(() => ({
  current: null as { db: unknown; docs: DocMap } | null,
}));

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => {
    if (!harness.current) {
      throw new Error('In-memory Firestore was not initialized');
    }

    return harness.current.db;
  },
}));

import { hashImportIdentity } from '@/lib/repositories/import-history.repository';
import { saleRepository } from '@/lib/repositories/sale.repository';
import type { SaleLineItem } from '@/types/sale';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const USER = 'user-1';
const IMPORT_A = 'imp-a';
const IMPORT_B = 'imp-b';

const line: SaleLineItem = {
  id: 'sl-1',
  productId: 'p-1',
  productNameSnapshot: 'Bread',
  productCodeSnapshot: 'BR-1',
  sellingPriceSnapshot: 500,
  quantity: 10,
  unit: 'pcs',
  lineTotal: 5000,
  unitCost: 0,
  cogs: 0,
};

function path(orgId: string, collection: string, id: string) {
  return `organizations/${orgId}/${collection}/${id}`;
}

function seed(orgId: string, collection: string, id: string, data: Record<string, unknown>) {
  harness.current?.docs.set(path(orgId, collection, id), data);
}

function sourceSalePath(orgId: string, importId: string, groupKey: string) {
  return `${path(orgId, 'importHistory', importId)}/sourceSales/${hashImportIdentity(groupKey)}`;
}

function seedImport(orgId: string, importId: string) {
  seed(orgId, 'importHistory', importId, {
    organizationId: orgId,
    saleIds: [],
    deletedAt: null,
    status: 'IMPORTING',
  });
}

function seedSequence(orgId: string) {
  seed(orgId, 'documentSequences', 'sale', {
    kind: 'sale',
    lastValue: 0,
    updatedAt: Timestamp.now(),
  });
}

beforeEach(() => {
  harness.current = createInMemoryFirestore();
  seedSequence(ORG_A);
  seedSequence(ORG_B);
  seedImport(ORG_A, IMPORT_A);
  seedImport(ORG_A, IMPORT_B);
  seedImport(ORG_B, IMPORT_A);
});

describe('sale import source-sale idempotency', () => {
  it('creates a sale and a source-sale link in the same transaction', async () => {
    const sale = await saleRepository.create(
      ORG_A,
      {
        saleDate: '2026-03-15',
        customerNameSnapshot: 'Corner Store',
        lines: [line],
        subtotal: 5000,
        importSource: { importId: IMPORT_A, groupKey: 'fallback:2026-03-15|corner store' },
      },
      USER,
    );

    expect(sale.id).toBeTruthy();
    expect(harness.current?.docs.get(sourceSalePath(ORG_A, IMPORT_A, 'fallback:2026-03-15|corner store'))).toMatchObject({
      saleId: sale.id,
      groupKey: 'fallback:2026-03-15|corner store',
    });
    expect(harness.current?.docs.get(path(ORG_A, 'importHistory', IMPORT_A))?.saleIds).toEqual([sale.id]);
  });

  it('reuses the linked sale on retry and does not create a second document', async () => {
    const first = await saleRepository.create(
      ORG_A,
      {
        saleDate: '2026-03-15',
        customerNameSnapshot: 'Corner Store',
        lines: [line],
        subtotal: 5000,
        importSource: { importId: IMPORT_A, groupKey: 'fallback:2026-03-15|corner store' },
      },
      USER,
    );

    const saleDocsBefore = [...(harness.current?.docs.keys() ?? [])].filter((key) =>
      key.includes('/sales/'),
    ).length;

    const second = await saleRepository.create(
      ORG_A,
      {
        saleDate: '2026-03-15',
        customerNameSnapshot: 'Corner Store',
        lines: [line],
        subtotal: 5000,
        importSource: { importId: IMPORT_A, groupKey: 'fallback:2026-03-15|corner store' },
      },
      USER,
    );

    const saleDocsAfter = [...(harness.current?.docs.keys() ?? [])].filter((key) =>
      key.includes('/sales/'),
    ).length;

    expect(second.id).toBe(first.id);
    expect(second.saleNumber).toBe(first.saleNumber);
    expect(saleDocsAfter).toBe(saleDocsBefore);
  });

  it('recovers a numbered sale when the source link is missing but importId matches', async () => {
    const first = await saleRepository.create(
      ORG_A,
      {
        saleNumber: 'INV-100',
        saleDate: '2026-03-15',
        customerNameSnapshot: 'Corner Store',
        lines: [line],
        subtotal: 5000,
        importSource: { importId: IMPORT_A, groupKey: 'number:INV-100' },
      },
      USER,
    );

    harness.current?.docs.delete(sourceSalePath(ORG_A, IMPORT_A, 'number:INV-100'));

    const recovered = await saleRepository.create(
      ORG_A,
      {
        saleNumber: 'INV-100',
        saleDate: '2026-03-15',
        customerNameSnapshot: 'Corner Store',
        lines: [line],
        subtotal: 5000,
        importSource: { importId: IMPORT_A, groupKey: 'number:INV-100' },
      },
      USER,
    );

    expect(recovered.id).toBe(first.id);
    expect(harness.current?.docs.get(sourceSalePath(ORG_A, IMPORT_A, 'number:INV-100'))).toMatchObject({
      saleId: first.id,
    });
  });

  it('does not reuse another import’s sale for the same invoice number', async () => {
    await saleRepository.create(
      ORG_A,
      {
        saleNumber: 'INV-100',
        saleDate: '2026-03-15',
        customerNameSnapshot: 'Corner Store',
        lines: [line],
        subtotal: 5000,
        importSource: { importId: IMPORT_A, groupKey: 'number:INV-100' },
      },
      USER,
    );

    await expect(
      saleRepository.create(
        ORG_A,
        {
          saleNumber: 'INV-100',
          saleDate: '2026-03-15',
          customerNameSnapshot: 'Corner Store',
          lines: [line],
          subtotal: 5000,
          importSource: { importId: IMPORT_B, groupKey: 'number:INV-100' },
        },
        USER,
      ),
    ).rejects.toMatchObject({
      name: DomainError.name,
      message: 'Sale number already exists',
    });
  });

  it('keeps organization isolation for the same invoice number', async () => {
    const saleA = await saleRepository.create(
      ORG_A,
      {
        saleNumber: 'INV-100',
        saleDate: '2026-03-15',
        customerNameSnapshot: 'Corner Store',
        lines: [line],
        subtotal: 5000,
        importSource: { importId: IMPORT_A, groupKey: 'number:INV-100' },
      },
      USER,
    );

    const saleB = await saleRepository.create(
      ORG_B,
      {
        saleNumber: 'INV-100',
        saleDate: '2026-03-15',
        customerNameSnapshot: 'Corner Store',
        lines: [line],
        subtotal: 5000,
        importSource: { importId: IMPORT_A, groupKey: 'number:INV-100' },
      },
      USER,
    );

    expect(saleA.id).not.toBe(saleB.id);
    expect(saleA.organizationId).toBe(ORG_A);
    expect(saleB.organizationId).toBe(ORG_B);
  });

  it('creates two unnumbered sales when the same looking row belongs to different imports', async () => {
    const groupKey = 'fallback:2026-03-15|ravi';
    const input = {
      saleDate: '2026-03-15',
      customerNameSnapshot: 'Ravi',
      lines: [line],
      subtotal: 5000,
    };

    const saleA = await saleRepository.create(
      ORG_A,
      { ...input, importSource: { importId: IMPORT_A, groupKey } },
      USER,
    );
    const saleB = await saleRepository.create(
      ORG_A,
      { ...input, importSource: { importId: IMPORT_B, groupKey } },
      USER,
    );

    expect(saleA.id).not.toBe(saleB.id);
    expect(saleA.saleNumber).not.toBe(saleB.saleNumber);
    expect(harness.current?.docs.get(sourceSalePath(ORG_A, IMPORT_A, groupKey))).toMatchObject({
      saleId: saleA.id,
    });
    expect(harness.current?.docs.get(sourceSalePath(ORG_A, IMPORT_B, groupKey))).toMatchObject({
      saleId: saleB.id,
    });
  });

  it('reuses the same sale when create is called twice for one import source (concurrent retry shape)', async () => {
    const groupKey = 'fallback:2026-03-15|ravi';
    const input = {
      saleDate: '2026-03-15',
      customerNameSnapshot: 'Ravi',
      lines: [line],
      subtotal: 5000,
      importSource: { importId: IMPORT_A, groupKey },
    };

    const first = await saleRepository.create(ORG_A, input, USER);
    const second = await saleRepository.create(ORG_A, input, USER);

    const saleDocs = [...(harness.current?.docs.keys() ?? [])].filter((key) =>
      key.includes('/sales/'),
    );

    expect(second.id).toBe(first.id);
    expect(saleDocs).toHaveLength(1);
  });
});
