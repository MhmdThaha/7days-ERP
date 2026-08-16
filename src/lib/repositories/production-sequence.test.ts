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

          if (path.includes('/documentSequences/production')) {
            if (!sequenceExistsOutside) {
              return { exists: false };
            }

            return {
              exists: true,
              data: () => ({ lastValue: sequenceLastValue, kind: 'production' }),
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

          if ((ref.path ?? '').includes('/documentSequences/production')) {
            sequenceExistsOutside = true;
            sequenceLastValue = Number(data.lastValue ?? 0);
          }
        }),
      };

      return fn(transaction);
    },
  }),
  getOrgCollection: (orgId: string, subcollection: string) => {
    if (subcollection === 'production') {
      return {
        doc: (id?: string) => ({
          id: id ?? 'new-production-1',
          path: `organizations/${orgId}/production/${id ?? 'new-production-1'}`,
        }),
        where: () => ({
          get: async () => {
            const docs = Array.from({ length: highestScanResult }, (_, index) => {
              const n = index + 1;
              return {
                id: `prd-${n}`,
                data: () => ({
                  productionNumber: `PRD-${String(n).padStart(3, '0')}`,
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
              data: () => ({ lastValue: sequenceLastValue, kind: 'production' }),
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

import { productionRepository } from '@/lib/repositories/production.repository';
import { reserveUniqueNumberInTransaction } from '@/lib/repositories/unique-number.repository';
import type { ProductionLineItem } from '@/types/production';

const line: ProductionLineItem = {
  id: 'prl-1',
  productId: 'p-1',
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
    { rawMaterialId: 'rm-maida', rawMaterialName: 'Maida', quantity: 1, unit: 'kg' },
  ],
};

describe('production sequence allocation', () => {
  beforeEach(() => {
    sequenceExistsOutside = false;
    sequenceLastValue = 0;
    highestScanResult = 0;
    lockGets.clear();
    transactionSets.length = 0;
    vi.mocked(reserveUniqueNumberInTransaction).mockClear();
  });

  it('allocates PRD-001 when the counter starts at 0', async () => {
    const production = await productionRepository.create(
      'org-a',
      {
        productionDate: '2026-08-16',
        lines: [line],
        totalUnits: 10,
      },
      'user-1',
    );

    expect(production.productionNumber).toBe('PRD-001');
    expect(production.status).toBe('draft');
    expect(sequenceLastValue).toBe(1);
  });

  it('initializes counter from existing PRD-001…PRD-013 history once', async () => {
    highestScanResult = 13;

    await productionRepository.ensureProductionSequenceInitialized('org-a');

    expect(sequenceExistsOutside).toBe(true);
    expect(sequenceLastValue).toBe(13);

    highestScanResult = 0;
    await productionRepository.ensureProductionSequenceInitialized('org-a');
    expect(sequenceLastValue).toBe(13);
  });

  it('allocates PRD-014 after initialized lastValue 13 without full production scan', async () => {
    sequenceExistsOutside = true;
    sequenceLastValue = 13;
    highestScanResult = 999;

    const production = await productionRepository.create(
      'org-a',
      {
        productionDate: '2026-08-16',
        lines: [line],
        totalUnits: 10,
      },
      'user-1',
    );

    expect(production.productionNumber).toBe('PRD-014');
    expect(sequenceLastValue).toBe(14);
    expect(reserveUniqueNumberInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      'org-a',
      'production',
      'PRD-014',
      'new-production-1',
    );
  });

  it('allocates consecutive numbers for two sequential creates (concurrent-safe counter)', async () => {
    sequenceExistsOutside = true;
    sequenceLastValue = 0;

    const first = await productionRepository.create(
      'org-a',
      { productionDate: '2026-08-16', lines: [line], totalUnits: 10 },
      'user-1',
    );
    const second = await productionRepository.create(
      'org-a',
      { productionDate: '2026-08-16', lines: [line], totalUnits: 10 },
      'user-2',
    );

    expect(first.productionNumber).toBe('PRD-001');
    expect(second.productionNumber).toBe('PRD-002');
    expect(sequenceLastValue).toBe(2);
  });

  it('keeps organization isolation via org-scoped sequence and lock paths', async () => {
    sequenceExistsOutside = true;
    sequenceLastValue = 0;

    await productionRepository.create(
      'org-b',
      {
        productionDate: '2026-08-16',
        lines: [line],
        totalUnits: 10,
      },
      'user-1',
    );

    expect(reserveUniqueNumberInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      'org-b',
      'production',
      'PRD-001',
      'new-production-1',
    );
    expect(transactionSets.some((entry) => entry.path.includes('organizations/org-b/'))).toBe(
      true,
    );
  });

  it('skips production numbers already held by uniqueNumbers locks', async () => {
    sequenceExistsOutside = true;
    sequenceLastValue = 13;
    lockGets.set('production_PRD-014', true);
    lockGets.set('production_PRD-015', true);

    const production = await productionRepository.create(
      'org-a',
      {
        productionDate: '2026-08-16',
        lines: [line],
        totalUnits: 10,
      },
      'user-1',
    );

    expect(production.productionNumber).toBe('PRD-016');
    expect(sequenceLastValue).toBe(16);
  });
});
