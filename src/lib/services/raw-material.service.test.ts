import { beforeEach, describe, expect, it, vi } from 'vitest';

import { rawMaterialRepository } from '@/lib/repositories/raw-material.repository';
import { rawMaterialService } from '@/lib/services/raw-material.service';
import { convertQuantity } from '@/lib/domain/units/uom-conversion';
import type { RawMaterial } from '@/types/raw-material';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/repositories/raw-material.repository', () => ({
  rawMaterialRepository: {
    create: vi.fn(),
    update: vi.fn(),
    getById: vi.fn(),
    findByName: vi.fn(),
    findByCode: vi.fn(),
    getHighestCodeNumber: vi.fn(),
  },
}));

function material(overrides: Partial<RawMaterial> = {}): RawMaterial {
  return {
    id: 'rm-maida',
    organizationId: 'org-a',
    code: 'RM-001',
    name: 'Maida',
    category: 'Flour',
    unit: 'kg',
    reorderLevel: null,
    description: null,
    isActive: true,
    currentStock: 1,
    averageCost: 4000,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    createdBy: 'user-1',
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedBy: 'user-1',
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

describe('rawMaterialService unit immutability', () => {
  beforeEach(() => {
    vi.mocked(rawMaterialRepository.create).mockReset();
    vi.mocked(rawMaterialRepository.update).mockReset();
    vi.mocked(rawMaterialRepository.getById).mockReset();
    vi.mocked(rawMaterialRepository.findByName).mockReset();
    vi.mocked(rawMaterialRepository.findByCode).mockReset();
    vi.mocked(rawMaterialRepository.getHighestCodeNumber).mockReset();
  });

  it('creates a raw material with kg', async () => {
    vi.mocked(rawMaterialRepository.findByName).mockResolvedValue(null);
    vi.mocked(rawMaterialRepository.findByCode).mockResolvedValue(null);
    vi.mocked(rawMaterialRepository.getHighestCodeNumber).mockResolvedValue(0);
    vi.mocked(rawMaterialRepository.create).mockResolvedValue(material({ unit: 'kg' }));

    const created = await rawMaterialService.create(
      'org-a',
      {
        name: 'Maida',
        category: 'Flour',
        unit: 'kg',
        isActive: true,
      },
      'user-1',
    );

    expect(created.unit).toBe('kg');
    expect(rawMaterialRepository.create).toHaveBeenCalledWith(
      'org-a',
      expect.objectContaining({ unit: 'kg' }),
      'user-1',
    );
  });

  it('creates a raw material with g', async () => {
    vi.mocked(rawMaterialRepository.findByName).mockResolvedValue(null);
    vi.mocked(rawMaterialRepository.findByCode).mockResolvedValue(null);
    vi.mocked(rawMaterialRepository.getHighestCodeNumber).mockResolvedValue(0);
    vi.mocked(rawMaterialRepository.create).mockResolvedValue(material({ unit: 'g', name: 'Yeast' }));

    const created = await rawMaterialService.create(
      'org-a',
      {
        name: 'Yeast',
        category: 'Yeast & Leavening',
        unit: 'g',
        isActive: true,
      },
      'user-1',
    );

    expect(created.unit).toBe('g');
    expect(rawMaterialRepository.create).toHaveBeenCalledWith(
      'org-a',
      expect.objectContaining({ unit: 'g' }),
      'user-1',
    );
  });

  it('updates allowed non-unit fields', async () => {
    const existing = material();
    vi.mocked(rawMaterialRepository.getById).mockResolvedValue(existing);
    vi.mocked(rawMaterialRepository.findByName).mockResolvedValue(null);
    vi.mocked(rawMaterialRepository.update).mockResolvedValue(
      material({ name: 'Maida Premium', description: 'Fine' }),
    );

    await rawMaterialService.update(
      'org-a',
      existing.id,
      { name: 'Maida Premium', description: 'Fine' },
      'user-1',
    );

    expect(rawMaterialRepository.update).toHaveBeenCalledWith(
      'org-a',
      existing.id,
      { name: 'Maida Premium', description: 'Fine' },
      'user-1',
    );
  });

  it('rejects changing unit from kg to g and does not write', async () => {
    const existing = material({ unit: 'kg', currentStock: 1, averageCost: 4000 });
    vi.mocked(rawMaterialRepository.getById).mockResolvedValue(existing);

    await expect(
      rawMaterialService.update('org-a', existing.id, { unit: 'g' }, 'user-1'),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Unit of measure cannot be changed after the raw material is created.',
    });

    expect(rawMaterialRepository.update).not.toHaveBeenCalled();
    expect(existing.unit).toBe('kg');
    expect(existing.currentStock).toBe(1);
    expect(existing.averageCost).toBe(4000);
  });

  it('ignores a matching unit on update so stock is not rewritten', async () => {
    const existing = material({ unit: 'kg', currentStock: 1, averageCost: 4000 });
    vi.mocked(rawMaterialRepository.getById).mockResolvedValue(existing);
    vi.mocked(rawMaterialRepository.findByName).mockResolvedValue(null);
    vi.mocked(rawMaterialRepository.update).mockResolvedValue(existing);

    await rawMaterialService.update(
      'org-a',
      existing.id,
      { unit: 'kg', name: 'Maida' },
      'user-1',
    );

    expect(rawMaterialRepository.update).toHaveBeenCalledWith(
      'org-a',
      existing.id,
      { name: 'Maida' },
      'user-1',
    );
  });

  it('does not change stored inventory when display conversion is 1 kg → 1000 g', () => {
    const storedStock = 1;
    const storedUnit = 'kg';

    expect(convertQuantity(storedStock, storedUnit, 'g')).toBe(1000);
    expect(storedStock).toBe(1);
    expect(storedUnit).toBe('kg');
  });
});
