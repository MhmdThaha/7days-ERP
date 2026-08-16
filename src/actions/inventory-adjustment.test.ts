import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainError } from '@/lib/domain/errors';

vi.mock('@/lib/firebase/auth-server', () => ({
  getAuthenticatedContext: vi.fn(),
}));

vi.mock('@/lib/services/inventory-adjustment.service', () => ({
  inventoryAdjustmentService: {
    confirm: vi.fn(),
    complete: vi.fn(),
  },
}));

import {
  completeInventoryAdjustmentAction,
  confirmInventoryAdjustmentAction,
} from '@/actions/inventory-adjustment';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
import { inventoryAdjustmentService } from '@/lib/services/inventory-adjustment.service';

const validInput = {
  itemType: 'raw_material' as const,
  itemId: 'rm-maida',
  physicalCount: 47,
  reason: 'physical_stock_count' as const,
  notes: null,
};

describe('confirmInventoryAdjustmentAction', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedContext).mockReset();
    vi.mocked(inventoryAdjustmentService.confirm).mockReset();
  });

  it('uses session org and allows owner', async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      orgId: 'org-a',
      userId: 'user-a',
      role: 'owner',
    });
    vi.mocked(inventoryAdjustmentService.confirm).mockResolvedValue({
      id: 'adj-1',
    } as never);

    const result = await confirmInventoryAdjustmentAction(validInput);

    expect(result.success).toBe(true);
    expect(inventoryAdjustmentService.confirm).toHaveBeenCalledWith(
      'org-a',
      validInput,
      'user-a',
    );
  });

  it('blocks sales from confirming an adjustment', async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      orgId: 'org-a',
      userId: 'sales-1',
      role: 'sales',
    });

    const result = await confirmInventoryAdjustmentAction(validInput);

    expect(result).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
    expect(inventoryAdjustmentService.confirm).not.toHaveBeenCalled();
  });

  it('requires a note when the reason is Other', async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      orgId: 'org-a',
      userId: 'owner-1',
      role: 'owner',
    });

    const result = await confirmInventoryAdjustmentAction({
      ...validInput,
      reason: 'other',
      notes: '   ',
    });

    expect(result).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    expect(inventoryAdjustmentService.confirm).not.toHaveBeenCalled();
  });
});

describe('completeInventoryAdjustmentAction', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedContext).mockReset();
    vi.mocked(inventoryAdjustmentService.complete).mockReset();
  });

  it('blocks store from completing an adjustment', async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      orgId: 'org-a',
      userId: 'store-1',
      role: 'store',
    });

    const result = await completeInventoryAdjustmentAction('adj-1');

    expect(result).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
    expect(inventoryAdjustmentService.complete).not.toHaveBeenCalled();
  });

  it('uses session org rather than a client org id', async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      orgId: 'org-a',
      userId: 'manager-1',
      role: 'manager',
    });
    vi.mocked(inventoryAdjustmentService.complete).mockResolvedValue({
      id: 'adj-1',
    } as never);

    const result = await completeInventoryAdjustmentAction('adj-1');

    expect(result.success).toBe(true);
    expect(inventoryAdjustmentService.complete).toHaveBeenCalledWith(
      'org-a',
      'adj-1',
      'manager-1',
    );
    expect(inventoryAdjustmentService.complete).not.toHaveBeenCalledWith(
      'org-b',
      expect.anything(),
      expect.anything(),
    );
  });

  it('returns USER_NOT_FOUND without calling the service', async () => {
    vi.mocked(getAuthenticatedContext).mockRejectedValue(
      new DomainError('USER_NOT_FOUND', 'User profile not found.'),
    );

    const result = await completeInventoryAdjustmentAction('adj-1');

    expect(result).toMatchObject({ success: false, code: 'USER_NOT_FOUND' });
    expect(inventoryAdjustmentService.complete).not.toHaveBeenCalled();
  });
});
