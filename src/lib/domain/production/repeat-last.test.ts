import { describe, expect, it } from 'vitest';

import {
  pickLatestProductionForRepeat,
  toRepeatLastFormLines,
} from '@/lib/domain/production/repeat-last';

describe('pickLatestProductionForRepeat (same meaning as list() sort)', () => {
  it('returns undefined when there are no productions', () => {
    expect(pickLatestProductionForRepeat([])).toBeUndefined();
  });

  it('returns the only production', () => {
    const only = { id: 'prd-1', productionDate: '2026-08-16', productionNumber: 'PRD-001' };
    expect(pickLatestProductionForRepeat([only])).toEqual(only);
  });

  it('selects the highest productionDate', () => {
    const older = { id: 'a', productionDate: '2026-08-15', productionNumber: 'PRD-099' };
    const newer = { id: 'b', productionDate: '2026-08-16', productionNumber: 'PRD-001' };
    expect(pickLatestProductionForRepeat([older, newer])?.id).toBe('b');
  });

  it('selects the highest productionNumber on the same date', () => {
    const ninth = { id: 'a', productionDate: '2026-08-16', productionNumber: 'PRD-009' };
    const tenth = { id: 'b', productionDate: '2026-08-16', productionNumber: 'PRD-010' };
    expect(pickLatestProductionForRepeat([ninth, tenth])?.id).toBe('b');
  });

  it('ignores draft vs completed when choosing latest date/number', () => {
    const completedOlder = {
      id: 'done',
      productionDate: '2026-08-15',
      productionNumber: 'PRD-050',
      status: 'completed',
    };
    const draftNewer = {
      id: 'draft',
      productionDate: '2026-08-16',
      productionNumber: 'PRD-001',
      status: 'draft',
    };
    expect(pickLatestProductionForRepeat([completedOlder, draftNewer])?.id).toBe('draft');
  });
});

describe('toRepeatLastFormLines', () => {
  it('copies only productId, quantity, and unit', () => {
    const lines = toRepeatLastFormLines([
      {
        productId: 'p-1',
        quantity: 12,
        unit: 'pcs',
        recipeId: 'r-1',
        recipeName: 'Cake v2',
        notes: 'ignored',
      } as never,
    ]);

    expect(lines).toEqual([{ productId: 'p-1', quantity: 12, unit: 'pcs' }]);
    expect(Object.keys(lines[0] ?? {})).toEqual(['productId', 'quantity', 'unit']);
  });
});
