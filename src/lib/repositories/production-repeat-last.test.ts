import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

type StoredDoc = {
  orgId: string;
  id: string;
  data: Record<string, unknown>;
};

const storedDocs: StoredDoc[] = [];
const collectionCalls: Array<{ orgId: string; subcollection: string }> = [];
const clauses: Array<{ method: string; args: unknown[] }> = [];

function createQuery(orgId: string) {
  let rows = storedDocs.filter((doc) => doc.orgId === orgId);
  const orders: Array<{ field: string; direction: string }> = [];
  let limitCount: number | undefined;

  const query = {
    where: (field: string, op: string, value: unknown) => {
      clauses.push({ method: 'where', args: [field, op, value] });
      if (field === 'deletedAt' && op === '==') {
        rows = rows.filter((doc) => doc.data.deletedAt === value);
      }
      return query;
    },
    orderBy: (field: string, direction: string) => {
      clauses.push({ method: 'orderBy', args: [field, direction] });
      orders.push({ field, direction });
      return query;
    },
    limit: (count: number) => {
      clauses.push({ method: 'limit', args: [count] });
      limitCount = count;
      return query;
    },
    get: async () => {
      const sorted = [...rows].sort((a, b) => {
        for (const order of orders) {
          const left = String(a.data[order.field] ?? '');
          const right = String(b.data[order.field] ?? '');
          const compare = left.localeCompare(right);
          if (compare !== 0) {
            return order.direction === 'desc' ? -compare : compare;
          }
        }
        return 0;
      });
      const limited = limitCount === undefined ? sorted : sorted.slice(0, limitCount);
      return {
        docs: limited.map((doc) => ({
          id: doc.id,
          data: () => doc.data,
        })),
      };
    },
  };

  return query;
}

vi.mock('@/lib/repositories/base.repository', () => ({
  getOrgCollection: (orgId: string, subcollection: string) => {
    collectionCalls.push({ orgId, subcollection });
    return createQuery(orgId);
  },
  getFirestore: vi.fn(),
  buildAuditFields: vi.fn(),
}));

import { productionRepository } from '@/lib/repositories/production.repository';

function productionDoc(
  orgId: string,
  id: string,
  overrides: Record<string, unknown>,
): StoredDoc {
  const now = new Date('2026-08-16T08:00:00.000Z');
  return {
    orgId,
    id,
    data: {
      organizationId: orgId,
      productionNumber: 'PRD-001',
      productionDate: '2026-08-16',
      status: 'completed',
      lines: [],
      totalUnits: 1,
      lineCount: 0,
      notes: null,
      createdAt: now,
      createdBy: 'user-1',
      updatedAt: now,
      updatedBy: 'user-1',
      completedAt: now,
      completedBy: 'user-1',
      deletedAt: null,
      deletedBy: null,
      ...overrides,
    },
  };
}

describe('productionRepository.getLatestForRepeat', () => {
  beforeEach(() => {
    storedDocs.length = 0;
    collectionCalls.length = 0;
    clauses.length = 0;
  });

  it('queries deletedAt, productionDate DESC, productionNumber DESC, limit 1', async () => {
    storedDocs.push(productionDoc('org-a', 'prd-1', {}));

    await productionRepository.getLatestForRepeat('org-a');

    expect(clauses).toEqual([
      { method: 'where', args: ['deletedAt', '==', null] },
      { method: 'orderBy', args: ['productionDate', 'desc'] },
      { method: 'orderBy', args: ['productionNumber', 'desc'] },
      { method: 'limit', args: [1] },
    ]);
    expect(clauses.some((clause) => clause.args[0] === 'status')).toBe(false);
    expect(clauses.some((clause) => clause.args[0] === 'createdAt')).toBe(false);
  });

  it('returns null when the organization has no productions', async () => {
    expect(await productionRepository.getLatestForRepeat('org-a')).toBeNull();
  });

  it('returns the only production', async () => {
    storedDocs.push(productionDoc('org-a', 'prd-1', { productionNumber: 'PRD-001' }));

    const result = await productionRepository.getLatestForRepeat('org-a');

    expect(result).toMatchObject({
      id: 'prd-1',
      productionNumber: 'PRD-001',
      productionDate: '2026-08-16',
    });
  });

  it('selects the highest productionDate', async () => {
    storedDocs.push(
      productionDoc('org-a', 'old', {
        productionDate: '2026-08-15',
        productionNumber: 'PRD-099',
      }),
      productionDoc('org-a', 'new', {
        productionDate: '2026-08-16',
        productionNumber: 'PRD-001',
      }),
    );

    expect((await productionRepository.getLatestForRepeat('org-a'))?.id).toBe('new');
  });

  it('selects the highest productionNumber on the same date', async () => {
    storedDocs.push(
      productionDoc('org-a', 'ninth', {
        productionDate: '2026-08-16',
        productionNumber: 'PRD-009',
      }),
      productionDoc('org-a', 'tenth', {
        productionDate: '2026-08-16',
        productionNumber: 'PRD-010',
      }),
    );

    expect((await productionRepository.getLatestForRepeat('org-a'))?.id).toBe('tenth');
  });

  it('includes drafts and completed productions', async () => {
    storedDocs.push(
      productionDoc('org-a', 'completed', {
        productionDate: '2026-08-15',
        productionNumber: 'PRD-050',
        status: 'completed',
      }),
      productionDoc('org-a', 'draft', {
        productionDate: '2026-08-16',
        productionNumber: 'PRD-001',
        status: 'draft',
      }),
    );

    expect((await productionRepository.getLatestForRepeat('org-a'))?.id).toBe('draft');
  });

  it('ignores soft-deleted productions', async () => {
    storedDocs.push(
      productionDoc('org-a', 'gone', {
        productionNumber: 'PRD-099',
        deletedAt: new Date('2026-08-16T09:00:00.000Z'),
      }),
      productionDoc('org-a', 'kept', { productionNumber: 'PRD-001' }),
    );

    expect((await productionRepository.getLatestForRepeat('org-a'))?.id).toBe('kept');
  });

  it('never returns another organization production', async () => {
    storedDocs.push(
      productionDoc('org-b', 'other', {
        productionDate: '2026-08-20',
        productionNumber: 'PRD-999',
      }),
      productionDoc('org-a', 'mine', {
        productionDate: '2026-08-01',
        productionNumber: 'PRD-001',
      }),
    );

    const result = await productionRepository.getLatestForRepeat('org-a');

    expect(collectionCalls).toEqual([{ orgId: 'org-a', subcollection: 'production' }]);
    expect(result?.id).toBe('mine');
  });
});
