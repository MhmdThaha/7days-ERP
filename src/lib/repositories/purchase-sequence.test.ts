import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let sequenceExistsOutside = false;
let sequenceLastValue = 0;
let highestScanResult = 0;
const lockGets = new Map<string, boolean>();
const transactionSets: Array<{ path: string; data: Record<string, unknown> }> = [];

vi.mock('@/lib/repositories/base.repository', () => ({
  getFirestore: () => ({
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const transaction = {
        get: vi.fn(async (ref: { path?: string }) => {
          const path = ref.path ?? '';

          if (path.includes('/documentSequences/purchase')) {
            if (!sequenceExistsOutside) {
              return { exists: false };
            }

            return {
              exists: true,
              data: () => ({ lastValue: sequenceLastValue, kind: 'purchase' }),
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

          if ((ref.path ?? '').includes('/documentSequences/purchase')) {
            sequenceExistsOutside = true;
            sequenceLastValue = Number(data.lastValue ?? 0);
          }
        }),
      };

      return fn(transaction);
    },
  }),
  getOrgCollection: (orgId: string, subcollection: string) => {
    if (subcollection === 'purchases') {
      return {
        doc: (id?: string) => ({
          id: id ?? 'new-purchase-1',
          path: `organizations/${orgId}/purchases/${id ?? 'new-purchase-1'}`,
        }),
        where: () => ({
          get: async () => {
            const docs = Array.from({ length: highestScanResult }, (_, index) => {
              const n = index + 1;
              return {
                id: `p-${n}`,
                data: () => ({
                  purchaseNumber: `PUR-${String(n).padStart(3, '0')}`,
                }),
              };
            });
            return { docs };
          },
        }),
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
              data: () => ({ lastValue: sequenceLastValue, kind: 'purchase' }),
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

import { purchaseRepository } from '@/lib/repositories/purchase.repository';
import { reserveUniqueNumberInTransaction } from '@/lib/repositories/unique-number.repository';

const lineItem = {
  id: 'line-1',
  rawMaterialId: 'rm-1',
  rawMaterialCode: 'RM-1',
  rawMaterialName: 'Flour',
  quantity: 1,
  unit: 'kg',
  unitCost: 100,
  lineTotal: 100,
  packCount: null,
  packSize: null,
  packPrice: null,
};

describe('purchase sequence allocation', () => {
  beforeEach(() => {
    sequenceExistsOutside = false;
    sequenceLastValue = 0;
    highestScanResult = 0;
    lockGets.clear();
    transactionSets.length = 0;
    vi.mocked(reserveUniqueNumberInTransaction).mockClear();
  });

  it('initializes counter from existing PUR-001…PUR-013 history once', async () => {
    highestScanResult = 13;

    await purchaseRepository.ensurePurchaseSequenceInitialized('org-a');

    expect(sequenceExistsOutside).toBe(true);
    expect(sequenceLastValue).toBe(13);

    highestScanResult = 0;
    await purchaseRepository.ensurePurchaseSequenceInitialized('org-a');
    expect(sequenceLastValue).toBe(13);
  });

  it('allocates PUR-014 after initialized lastValue 13 without full purchase scan', async () => {
    sequenceExistsOutside = true;
    sequenceLastValue = 13;
    highestScanResult = 999;

    const purchase = await purchaseRepository.create(
      'org-a',
      {
        purchaseDate: '2026-08-13',
        supplierName: 'Supplier',
        paymentStatus: 'paid',
        lineItems: [lineItem],
        totalAmount: 100,
      },
      'user-1',
    );

    expect(purchase.purchaseNumber).toBe('PUR-014');
    expect(sequenceLastValue).toBe(14);
    expect(reserveUniqueNumberInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      'org-a',
      'purchase',
      'PUR-014',
      'new-purchase-1',
    );
  });

  it('keeps organization isolation via org-scoped sequence and lock paths', async () => {
    sequenceExistsOutside = true;
    sequenceLastValue = 0;

    await purchaseRepository.create(
      'org-b',
      {
        purchaseDate: '2026-08-13',
        supplierName: 'Supplier',
        paymentStatus: 'credit',
        lineItems: [lineItem],
        totalAmount: 100,
      },
      'user-1',
    );

    expect(reserveUniqueNumberInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      'org-b',
      'purchase',
      'PUR-001',
      'new-purchase-1',
    );
    expect(transactionSets.some((entry) => entry.path.includes('organizations/org-b/'))).toBe(
      true,
    );
  });

  it('skips purchase numbers already held by uniqueNumbers locks', async () => {
    sequenceExistsOutside = true;
    sequenceLastValue = 13;
    lockGets.set('purchase_PUR-014', true);
    lockGets.set('purchase_PUR-015', true);

    const purchase = await purchaseRepository.create(
      'org-a',
      {
        purchaseDate: '2026-08-13',
        supplierName: 'Supplier',
        paymentStatus: 'paid',
        lineItems: [lineItem],
        totalAmount: 100,
      },
      'user-1',
    );

    expect(purchase.purchaseNumber).toBe('PUR-016');
    expect(sequenceLastValue).toBe(16);
  });
});
