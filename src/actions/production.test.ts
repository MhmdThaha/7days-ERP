import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainError } from '@/lib/domain/errors';

vi.mock('@/lib/firebase/auth-server', () => ({
  getAuthenticatedContext: vi.fn(),
}));

vi.mock('@/lib/services/production.service', () => ({
  productionService: {
    complete: vi.fn(),
    listPage: vi.fn(),
    getById: vi.fn(),
    getLatestForRepeat: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/inventory-movement.repository', () => ({
  inventoryMovementRepository: {
    listBySourceDocument: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/raw-material.repository', () => ({
  rawMaterialRepository: {
    getByIds: vi.fn(),
    getById: vi.fn(),
  },
}));

import {
  completeProductionAction,
  getLatestProductionForRepeatAction,
  getProductionConsumedMaterialsAction,
  listProductionsPageAction,
} from '@/actions/production';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
import { inventoryMovementRepository } from '@/lib/repositories/inventory-movement.repository';
import { rawMaterialRepository } from '@/lib/repositories/raw-material.repository';
import { productionService } from '@/lib/services/production.service';

describe('completeProductionAction RBAC', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedContext).mockReset();
    vi.mocked(productionService.complete).mockReset();
  });

  it('allows production role and uses session org', async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      orgId: 'org-a',
      userId: 'prod-1',
      role: 'production',
    });
    vi.mocked(productionService.complete).mockResolvedValue({ id: 'prd-1' } as never);

    const result = await completeProductionAction('prd-1');

    expect(result.success).toBe(true);
    expect(productionService.complete).toHaveBeenCalledWith('org-a', 'prd-1', 'prod-1');
  });

  it('blocks sales from completing production', async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      orgId: 'org-a',
      userId: 'sales-1',
      role: 'sales',
    });

    const result = await completeProductionAction('prd-1');

    expect(result).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
    expect(productionService.complete).not.toHaveBeenCalled();
  });

  it('blocks store from completing production', async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      orgId: 'org-a',
      userId: 'store-1',
      role: 'store',
    });

    const result = await completeProductionAction('prd-1');

    expect(result).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
    expect(productionService.complete).not.toHaveBeenCalled();
  });
});

describe('listProductionsPageAction RBAC', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedContext).mockReset();
    vi.mocked(productionService.listPage).mockReset();
  });

  it('uses session org rather than a client org id', async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      orgId: 'org-a',
      userId: 'owner-1',
      role: 'owner',
    });
    vi.mocked(productionService.listPage).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
      totalPages: 1,
      startCursor: null,
      endCursor: null,
    });

    const result = await listProductionsPageAction({ position: 'first' });

    expect(result.success).toBe(true);
    expect(productionService.listPage).toHaveBeenCalledWith(
      'org-a',
      expect.objectContaining({ position: 'first' }),
    );
  });
});

describe('getLatestProductionForRepeatAction', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedContext).mockReset();
    vi.mocked(productionService.getLatestForRepeat).mockReset();
    vi.mocked(productionService.listPage).mockReset();
  });

  it('uses session org and does not call listPage', async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      orgId: 'org-a',
      userId: 'owner-1',
      role: 'owner',
    });
    vi.mocked(productionService.getLatestForRepeat).mockResolvedValue({
      id: 'prd-10',
      productionNumber: 'PRD-010',
      productionDate: '2026-08-16',
    } as never);

    const result = await getLatestProductionForRepeatAction();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({ id: 'prd-10', productionNumber: 'PRD-010' });
    }
    expect(productionService.getLatestForRepeat).toHaveBeenCalledWith('org-a');
    expect(productionService.listPage).not.toHaveBeenCalled();
  });
});

describe('getProductionConsumedMaterialsAction', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedContext).mockReset();
    vi.mocked(productionService.getById).mockReset();
    vi.mocked(inventoryMovementRepository.listBySourceDocument).mockReset();
    vi.mocked(rawMaterialRepository.getByIds).mockReset();
    vi.mocked(rawMaterialRepository.getById).mockReset();
  });

  it('loads raw materials in one batched getByIds call', async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      orgId: 'org-a',
      userId: 'owner-1',
      role: 'owner',
    });
    vi.mocked(productionService.getById).mockResolvedValue({
      id: 'prd-1',
      status: 'completed',
    } as never);
    vi.mocked(inventoryMovementRepository.listBySourceDocument).mockResolvedValue([
      {
        id: 'm1',
        organizationId: 'org-a',
        movementDate: '2026-08-14',
        itemType: 'raw_material',
        itemId: 'rm-flour',
        itemName: 'Flour',
        movementType: 'PRODUCTION_RAW_OUT',
        quantity: 10,
        unit: 'kg',
        unitCost: 50,
        totalCost: 500,
        balanceAfter: 10,
        averageCostAfter: 50,
        sourceDocumentType: 'production',
        sourceDocumentId: 'prd-1',
        sourceLineId: 'line-1',
        notes: null,
        createdAt: new Date(),
        createdBy: 'owner-1',
      },
      {
        id: 'm2',
        organizationId: 'org-a',
        movementDate: '2026-08-14',
        itemType: 'raw_material',
        itemId: 'rm-sugar',
        itemName: 'Sugar',
        movementType: 'PRODUCTION_RAW_OUT',
        quantity: 2,
        unit: 'kg',
        unitCost: 40,
        totalCost: 80,
        balanceAfter: 8,
        averageCostAfter: 40,
        sourceDocumentType: 'production',
        sourceDocumentId: 'prd-1',
        sourceLineId: 'line-1',
        notes: null,
        createdAt: new Date(),
        createdBy: 'owner-1',
      },
    ]);
    vi.mocked(rawMaterialRepository.getByIds).mockResolvedValue([
      {
        id: 'rm-flour',
        code: 'FL-1',
        name: 'Flour',
        unit: 'kg',
        currentStock: 10,
        averageCost: 50,
        isActive: true,
      } as never,
      {
        id: 'rm-sugar',
        code: 'SG-1',
        name: 'Sugar',
        unit: 'kg',
        currentStock: 8,
        averageCost: 40,
        isActive: true,
      } as never,
    ]);

    const result = await getProductionConsumedMaterialsAction('prd-1');

    expect(result.success).toBe(true);
    expect(rawMaterialRepository.getByIds).toHaveBeenCalledWith('org-a', ['rm-flour', 'rm-sugar']);
    expect(rawMaterialRepository.getById).not.toHaveBeenCalled();
  });

  it('returns USER_NOT_FOUND without calling services', async () => {
    vi.mocked(getAuthenticatedContext).mockRejectedValue(
      new DomainError('USER_NOT_FOUND', 'User profile not found.'),
    );

    const result = await completeProductionAction('prd-1');

    expect(result).toMatchObject({ success: false, code: 'USER_NOT_FOUND' });
    expect(productionService.complete).not.toHaveBeenCalled();
  });
});
