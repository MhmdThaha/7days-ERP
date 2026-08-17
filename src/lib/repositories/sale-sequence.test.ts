import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let sequenceExistsOutside = false;
let sequenceLastValue = 0;
let highestScanResult = 0;
const lockGets = new Map<string, boolean>();
const transactionSets: Array<{ path: string; data: Record<string, unknown> }> = [];
const collectionWhereCalls: Array<{ orgId: string; subcollection: string }> = [];

vi.mock('@/lib/repositories/base.repository', () => ({
  getFirestore: () => ({
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const transaction = {
        get: vi.fn(async (ref: { path?: string }) => {
          const path = ref.path ?? '';

          if (path.includes('/documentSequences/sale')) {
            if (!sequenceExistsOutside) {
              return { exists: false };
            }

            return {
              exists: true,
              data: () => ({ lastValue: sequenceLastValue, kind: 'sale' }),
            };
          }

          if (path.includes('/uniqueNumbers/')) {
            const id = path.split('/').pop() ?? '';
            return { exists: lockGets.get(id) === true };
          }

          return { exists: false };
        }),
        set: vi.fn((ref: { path?: string }, data: Record<string, unknown>) => {
          transactionSets.push({ path: ref.path ?? '', data });

          if ((ref.path ?? '').includes('/documentSequences/sale')) {
            sequenceExistsOutside = true;
            sequenceLastValue = Number(data.lastValue ?? 0);
          }
        }),
      };

      return fn(transaction);
    },
  }),
  getOrgCollection: (orgId: string, subcollection: string) => {
    if (subcollection === 'sales') {
      return {
        doc: (id?: string) => ({
          id: id ?? 'new-sale-1',
          path: `organizations/${orgId}/sales/${id ?? 'new-sale-1'}`,
        }),
        where: () => {
          collectionWhereCalls.push({ orgId, subcollection });
          return {
            get: async () => {
              const docs = Array.from({ length: highestScanResult }, (_, index) => {
                const n = index + 1;
                return {
                  id: `sal-${n}`,
                  data: () => ({
                    saleNumber: `SAL-${String(n).padStart(3, '0')}`,
                  }),
                };
              });
              return { docs };
            },
          };
        },
      };
    }

    if (subcollection === 'documentSequences') {
      return {
        doc: (id: string) => ({
          id,
          path: `organizations/${orgId}/documentSequences/${id}`,
          get: async () => {
            if (!sequenceExistsOutside) {
              return { exists: false };
            }

            return {
              exists: true,
              data: () => ({ lastValue: sequenceLastValue, kind: 'sale' }),
            };
          },
        }),
      };
    }

    if (subcollection === 'uniqueNumbers') {
      return {
        doc: (id: string) => ({
          id,
          path: `organizations/${orgId}/uniqueNumbers/${id}`,
        }),
      };
    }

    return {
      doc: (id: string) => ({
        id,
        path: `organizations/${orgId}/${subcollection}/${id}`,
      }),
    };
  },
  buildAuditFields: () => ({}),
}));

vi.mock('@/lib/repositories/unique-number.repository', () => ({
  reserveUniqueNumberInTransaction: vi.fn(async () => undefined),
}));

vi.mock('@/lib/repositories/inventory.repository', () => ({
  inventoryRepository: {},
}));

import { saleRepository } from '@/lib/repositories/sale.repository';
import { reserveUniqueNumberInTransaction } from '@/lib/repositories/unique-number.repository';
import type { SaleLineItem } from '@/types/sale';

const line: SaleLineItem = {
  id: 'sl-1',
  productId: 'p-1',
  productNameSnapshot: 'Bread',
  productCodeSnapshot: 'BR-1',
  sellingPriceSnapshot: 500,
  quantity: 2,
  unit: 'pcs',
  lineTotal: 1000,
  unitCost: 0,
  cogs: 0,
};

function createInput(saleNumber?: string) {
  return {
    saleNumber,
    saleDate: '2026-08-16',
    customerNameSnapshot: null,
    lines: [line],
    subtotal: 1000,
  };
}

describe('sale sequence allocation', () => {
  beforeEach(() => {
    sequenceExistsOutside = false;
    sequenceLastValue = 0;
    highestScanResult = 0;
    lockGets.clear();
    transactionSets.length = 0;
    collectionWhereCalls.length = 0;
    vi.mocked(reserveUniqueNumberInTransaction).mockClear();
  });

  it('allocates SAL-001 when the counter starts at 0', async () => {
    const sale = await saleRepository.create('org-a', createInput(), 'user-1');

    expect(sale.saleNumber).toBe('SAL-001');
    expect(sale.status).toBe('draft');
    expect(sequenceLastValue).toBe(1);
  });

  it('initializes counter from existing SAL-001…SAL-013 history once', async () => {
    highestScanResult = 13;

    await saleRepository.ensureSaleSequenceInitialized('org-a');

    expect(sequenceExistsOutside).toBe(true);
    expect(sequenceLastValue).toBe(13);

    collectionWhereCalls.length = 0;
    highestScanResult = 0;
    await saleRepository.ensureSaleSequenceInitialized('org-a');
    expect(sequenceLastValue).toBe(13);
    expect(collectionWhereCalls).toHaveLength(0);
  });

  it('allocates SAL-014 after initialized lastValue 13 without a full sales scan', async () => {
    sequenceExistsOutside = true;
    sequenceLastValue = 13;
    highestScanResult = 999;

    const sale = await saleRepository.create('org-a', createInput(), 'user-1');

    expect(sale.saleNumber).toBe('SAL-014');
    expect(sequenceLastValue).toBe(14);
    expect(collectionWhereCalls).toHaveLength(0);
    expect(reserveUniqueNumberInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      'org-a',
      'sale',
      'SAL-014',
      'new-sale-1',
    );
  });

  it('allocates consecutive numbers for two sequential creates', async () => {
    sequenceExistsOutside = true;
    sequenceLastValue = 0;

    const first = await saleRepository.create('org-a', createInput(), 'user-1');
    const second = await saleRepository.create('org-a', createInput(), 'user-2');

    expect(first.saleNumber).toBe('SAL-001');
    expect(second.saleNumber).toBe('SAL-002');
    expect(sequenceLastValue).toBe(2);
  });

  it('keeps organization isolation via org-scoped sequence and lock paths', async () => {
    sequenceExistsOutside = true;
    sequenceLastValue = 0;

    await saleRepository.create('org-b', createInput(), 'user-1');

    expect(reserveUniqueNumberInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      'org-b',
      'sale',
      'SAL-001',
      'new-sale-1',
    );
    expect(transactionSets.some((entry) => entry.path.includes('organizations/org-b/'))).toBe(true);
  });

  it('skips sale numbers already held by uniqueNumbers locks (soft-deleted drafts)', async () => {
    sequenceExistsOutside = true;
    sequenceLastValue = 13;
    lockGets.set('sale_SAL-014', true);
    lockGets.set('sale_SAL-015', true);

    const sale = await saleRepository.create('org-a', createInput(), 'user-1');

    expect(sale.saleNumber).toBe('SAL-016');
    expect(sequenceLastValue).toBe(16);
  });

  it('uses an imported saleNumber without scanning sales history', async () => {
    sequenceExistsOutside = true;
    sequenceLastValue = 13;
    highestScanResult = 999;

    const sale = await saleRepository.create('org-a', createInput('SAL-300'), 'user-1');

    expect(sale.saleNumber).toBe('SAL-300');
    expect(sequenceLastValue).toBe(300);
    expect(collectionWhereCalls).toHaveLength(0);
    expect(reserveUniqueNumberInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      'org-a',
      'sale',
      'SAL-300',
      'new-sale-1',
    );
  });

  it('does not bump the SAL sequence for non-SAL imported invoice numbers', async () => {
    sequenceExistsOutside = true;
    sequenceLastValue = 5;

    const sale = await saleRepository.create('org-a', createInput('INV-1234'), 'user-1');

    expect(sale.saleNumber).toBe('INV-1234');
    expect(sequenceLastValue).toBe(5);
  });

  it('does not write existing sale documents when allocating a new number', async () => {
    sequenceExistsOutside = true;
    sequenceLastValue = 2;

    await saleRepository.create('org-a', createInput(), 'user-1');

    const saleDocWrites = transactionSets.filter((entry) =>
      /\/sales\/(?!new-sale-1)/.test(entry.path),
    );
    expect(saleDocWrites).toHaveLength(0);
  });
});
