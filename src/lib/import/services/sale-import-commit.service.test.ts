/**
 * Sale Import Commit tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainError } from '@/lib/domain/errors';
import type { NormalizedValue } from '@/lib/import/engine/types';
import type { ExistingProductMatch } from '@/lib/import/services/conflict.service';
import {
  buildSaleImportCreateInput,
  commitSaleImport,
  importMoneyToSaleMinorUnits,
} from '@/lib/import/services/sale-import-commit.service';
import type {
  ResolvedSaleImportGroup,
  ResolvedSaleImportLineItem,
} from '@/lib/import/services/sale-import-product-resolver';
import { productRepository } from '@/lib/repositories/product.repository';
import { saleService } from '@/lib/services/sale.service';
import type { Sale } from '@/types/sale';

vi.mock('@/lib/services/sale.service', () => ({
  saleService: {
    create: vi.fn(),
    complete: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/product.repository', () => ({
  productRepository: {
    getById: vi.fn(),
  },
}));

const bread: ExistingProductMatch = { id: 'prod-bread', name: 'Milk Bread', code: 'BRD-001' };
const cake: ExistingProductMatch = { id: 'prod-cake', name: 'Chocolate Cake', code: 'CKE-010' };

function resolvedLine(
  rowNumber: number,
  values: Record<string, NormalizedValue>,
  product: ExistingProductMatch,
  status: ResolvedSaleImportLineItem['status'] = 'valid',
): ResolvedSaleImportLineItem {
  return {
    rowNumber,
    values,
    status,
    issues: [],
    resolvedProduct: product,
  };
}

function cleanGroup(
  groupKey: string,
  lines: ResolvedSaleImportLineItem[],
  options: {
    saleNumber?: string | null;
    saleDate?: NormalizedValue;
    customerName?: NormalizedValue;
    notes?: NormalizedValue;
  } = {},
): ResolvedSaleImportGroup {
  const saleNumber = options.saleNumber === undefined ? 'SAL-100' : options.saleNumber;

  return {
    groupKey,
    rowNumbers: lines.map((line) => line.rowNumber),
    header: {
      saleNumber,
      normalizedSaleNumber: saleNumber ? saleNumber.trim().toUpperCase() : null,
      saleDate: options.saleDate ?? '2026-03-15',
      customerName: options.customerName ?? 'Corner Store',
      notes: options.notes ?? null,
    },
    lines,
    groupIssues: [],
  };
}

function completedSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 'sale-1',
    organizationId: 'org-1',
    saleNumber: 'SAL-100',
    saleDate: '2026-03-15',
    customerId: null,
    customerNameSnapshot: 'Corner Store',
    status: 'completed',
    lines: [],
    subtotal: 4500,
    totalCogs: 1000,
    lineCount: 1,
    notes: null,
    createdAt: new Date('2026-03-15'),
    createdBy: 'user-1',
    updatedAt: new Date('2026-03-15'),
    updatedBy: 'user-1',
    completedAt: new Date('2026-03-15'),
    completedBy: 'user-1',
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

describe('importMoneyToSaleMinorUnits', () => {
  it('converts import major units to sale paise', () => {
    expect(importMoneyToSaleMinorUnits(45)).toBe(4500);
    expect(importMoneyToSaleMinorUnits(45.5)).toBe(4550);
  });
});

describe('buildSaleImportCreateInput', () => {
  it('builds a CreateSaleInput DTO from a clean group', () => {
    const group = cleanGroup('number:SAL-100', [
      resolvedLine(2, { productCode: 'BRD-001', quantity: 2, sellingPrice: 45 }, bread),
    ]);

    expect(buildSaleImportCreateInput(group)).toEqual({
      saleDate: '2026-03-15',
      customerName: 'Corner Store',
      notes: null,
      saleNumber: 'SAL-100',
      lines: [{ productId: 'prod-bread', quantity: 2, sellingPrice: 4500 }],
    });
  });

  it('omits saleNumber when the import group has none', () => {
    const group = cleanGroup(
      'fallback:2026-03-15|corner store',
      [resolvedLine(2, { productName: 'Milk Bread', quantity: 1, sellingPrice: 45 }, bread)],
      { saleNumber: null },
    );

    expect(buildSaleImportCreateInput(group)).toEqual({
      saleDate: '2026-03-15',
      customerName: 'Corner Store',
      notes: null,
      lines: [{ productId: 'prod-bread', quantity: 1, sellingPrice: 4500 }],
    });
  });

  it('rejects groups with duplicate products on separate lines', () => {
    const group = cleanGroup('number:SAL-200', [
      resolvedLine(2, { productCode: 'BRD-001', quantity: 1, sellingPrice: 45 }, bread),
      resolvedLine(3, { productCode: 'BRD-001', quantity: 2, sellingPrice: 45 }, bread),
    ]);

    expect(buildSaleImportCreateInput(group)).toMatchObject({
      code: 'DUPLICATE_PRODUCT',
    });
  });

  it('ignores error lines when building the DTO', () => {
    const group = cleanGroup(
      'number:SAL-300',
      [
        {
          rowNumber: 2,
          values: { productName: 'Missing', quantity: 1 },
          status: 'error',
          issues: [],
          resolvedProduct: null,
        },
        resolvedLine(3, { productCode: 'CKE-010', quantity: 1, sellingPrice: 120 }, cake),
      ],
      { saleNumber: 'SAL-300' },
    );

    expect(buildSaleImportCreateInput(group)).toEqual({
      saleDate: '2026-03-15',
      customerName: 'Corner Store',
      notes: null,
      saleNumber: 'SAL-300',
      lines: [{ productId: 'prod-cake', quantity: 1, sellingPrice: 12000 }],
    });
  });
});

describe('commitSaleImport', () => {
  beforeEach(() => {
    vi.mocked(saleService.create).mockReset();
    vi.mocked(saleService.complete).mockReset();
    vi.mocked(productRepository.getById).mockReset();
  });

  it('creates and completes each clean group, returning import results', async () => {
    const group = cleanGroup('number:SAL-100', [
      resolvedLine(2, { productCode: 'BRD-001', quantity: 2, sellingPrice: 45 }, bread),
    ]);

    vi.mocked(saleService.create).mockResolvedValue(
      completedSale({ id: 'sale-draft', status: 'draft', completedAt: null, completedBy: null }),
    );
    vi.mocked(saleService.complete).mockResolvedValue(completedSale({ id: 'sale-draft' }));

    const result = await commitSaleImport([group], { orgId: 'org-1', userId: 'user-1' });

    expect(saleService.create).toHaveBeenCalledWith(
      'org-1',
      {
        saleDate: '2026-03-15',
        customerName: 'Corner Store',
        notes: null,
        saleNumber: 'SAL-100',
        lines: [{ productId: 'prod-bread', quantity: 2, sellingPrice: 4500 }],
      },
      'user-1',
    );
    expect(saleService.complete).toHaveBeenCalledWith('org-1', 'sale-draft', 'user-1');
    expect(result.importedCount).toBe(1);
    expect(result.saleIds).toEqual(['sale-draft']);
    expect(result.groupResults[0]).toMatchObject({
      groupKey: 'number:SAL-100',
      rowNumbers: [2],
      status: 'imported',
      saleNumber: 'SAL-100',
    });
  });

  it('uses product selling price when the import row omits sellingPrice', async () => {
    const group = cleanGroup('number:SAL-400', [
      resolvedLine(2, { productCode: 'BRD-001', quantity: 1 }, bread),
    ]);

    vi.mocked(productRepository.getById).mockResolvedValue({
      id: 'prod-bread',
      organizationId: 'org-1',
      code: 'BRD-001',
      name: 'Milk Bread',
      category: 'Bread',
      unit: 'pcs',
      sellingPrice: 5500,
      description: null,
      isActive: true,
      currentStock: 10,
      averageCost: 3000,
      activeRecipeId: null,
      imageUrl: null,
      createdAt: new Date(),
      createdBy: 'user-1',
      updatedAt: new Date(),
      updatedBy: 'user-1',
      deletedAt: null,
      deletedBy: null,
    });
    vi.mocked(saleService.create).mockResolvedValue(
      completedSale({ id: 'sale-2', saleNumber: 'SAL-400' }),
    );
    vi.mocked(saleService.complete).mockResolvedValue(
      completedSale({ id: 'sale-2', saleNumber: 'SAL-400' }),
    );

    await commitSaleImport([group], { orgId: 'org-1', userId: 'user-1' });

    expect(saleService.create).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        lines: [{ productId: 'prod-bread', quantity: 1, sellingPrice: 5500 }],
      }),
      'user-1',
    );
  });

  it('isolates failures so one failed group does not stop the rest', async () => {
    const successGroup = cleanGroup(
      'number:SAL-OK',
      [resolvedLine(2, { productCode: 'BRD-001', quantity: 1, sellingPrice: 45 }, bread)],
      { saleNumber: 'SAL-OK' },
    );
    const failGroup = cleanGroup(
      'number:SAL-FAIL',
      [resolvedLine(3, { productCode: 'CKE-010', quantity: 1, sellingPrice: 120 }, cake)],
      { saleNumber: 'SAL-FAIL' },
    );

    vi.mocked(saleService.create)
      .mockRejectedValueOnce(new DomainError('VALIDATION_ERROR', 'Insufficient stock'))
      .mockResolvedValueOnce(completedSale({ id: 'sale-ok', saleNumber: 'SAL-OK' }));
    vi.mocked(saleService.complete).mockResolvedValue(
      completedSale({ id: 'sale-ok', saleNumber: 'SAL-OK' }),
    );

    const result = await commitSaleImport([failGroup, successGroup], {
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.importedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.groupResults.find((entry) => entry.groupKey === 'number:SAL-FAIL')?.status).toBe(
      'failed',
    );
    expect(result.groupResults.find((entry) => entry.groupKey === 'number:SAL-OK')?.status).toBe(
      'imported',
    );
    expect(result.commitErrors).toHaveLength(1);
  });

  it('skips groups that cannot build a DTO', async () => {
    const group = cleanGroup('number:SAL-EMPTY', [], { saleNumber: 'SAL-EMPTY' });

    const result = await commitSaleImport([group], { orgId: 'org-1', userId: 'user-1' });

    expect(result.skippedCount).toBe(1);
    expect(saleService.create).not.toHaveBeenCalled();
    expect(result.groupResults[0]).toMatchObject({
      status: 'skipped',
      reason: 'Sale has no importable product lines.',
    });
  });
});
