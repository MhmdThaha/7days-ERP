/**
 * Import entity handler registry tests.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainError } from '@/lib/domain/errors';
import type { ValidatedRow } from '@/lib/import/engine/types';
import type { ConflictDetectionResult } from '@/lib/import/services/conflict.service';
import {
  assertImportCommitSupported,
  assertImportConflictSupported,
  getImportConflictHandler,
} from '@/lib/import/services/import-entity-handlers';
import type { ImportRunReport } from '@/lib/import/services/import.service';

vi.mock('@/lib/import/services/conflict.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/import/services/conflict.service')>()),
  detectProductImportConflictsForOrg: vi.fn(),
}));

vi.mock('@/lib/import/services/sale-import-grouping.service', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/import/services/sale-import-grouping.service')
  >()),
  groupSaleImportRows: vi.fn(),
}));

vi.mock('@/lib/import/services/sale-import-product-resolver', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/import/services/sale-import-product-resolver')
  >()),
  resolveSaleImportProductsForOrg: vi.fn(),
}));

vi.mock('@/lib/import/services/sale-conflict.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/import/services/sale-conflict.service')>()),
  detectSaleImportConflictsForOrg: vi.fn(),
}));

vi.mock('@/lib/import/services/sale-import-commit.service', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/import/services/sale-import-commit.service')
  >()),
  commitSaleImport: vi.fn(),
}));

vi.mock('@/lib/import/services/conflict-resolution.service', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/import/services/conflict-resolution.service')
  >()),
  commitProductImportWithResolution: vi.fn(),
}));

import { detectProductImportConflictsForOrg } from '@/lib/import/services/conflict.service';
import { commitProductImportWithResolution } from '@/lib/import/services/conflict-resolution.service';
import { commitSaleImport } from '@/lib/import/services/sale-import-commit.service';
import { detectSaleImportConflictsForOrg } from '@/lib/import/services/sale-conflict.service';
import { groupSaleImportRows } from '@/lib/import/services/sale-import-grouping.service';
import { resolveSaleImportProductsForOrg } from '@/lib/import/services/sale-import-product-resolver';
import {
  assertImportLegacyCommitSupported,
  getImportCommitHandler,
} from '@/lib/import/services/import-entity-handlers';

function productReport(rows: ValidatedRow[]): ImportRunReport {
  return {
    entityType: 'product',
    sheetName: 'Items',
    headers: ['Item Name'],
    skippedEmptyRowCount: 0,
    ignoredHeaders: [],
    missingSourceHeaders: [],
    missingRequiredFields: [],
    result: {
      rows,
      summary: {
        totalRows: rows.length,
        validRows: rows.length,
        warningRows: 0,
        errorRows: 0,
      },
    },
  };
}

function saleReport(rows: ValidatedRow[]): ImportRunReport {
  return {
    ...productReport(rows),
    entityType: 'sale',
    sheetName: 'Sales',
  };
}

const db = {} as Firestore;
const context = { db, orgId: 'org-1', userId: 'user-1' };

beforeEach(() => {
  vi.mocked(detectProductImportConflictsForOrg).mockReset();
  vi.mocked(groupSaleImportRows).mockReset();
  vi.mocked(resolveSaleImportProductsForOrg).mockReset();
  vi.mocked(detectSaleImportConflictsForOrg).mockReset();
  vi.mocked(commitSaleImport).mockReset();
  vi.mocked(commitProductImportWithResolution).mockReset();
});

describe('import entity registry', () => {
  it('registers product and sale conflict handlers', () => {
    expect(getImportConflictHandler('product')).toBeTypeOf('function');
    expect(getImportConflictHandler('sale')).toBeTypeOf('function');
    expect(getImportConflictHandler('supplier')).toBeUndefined();
  });

  it('throws for unsupported conflict entities', () => {
    expect(() => assertImportConflictSupported('supplier' as never)).toThrow(DomainError);
  });

  it('throws for unsupported commit entities', () => {
    expect(() => assertImportCommitSupported('customer' as never)).toThrow(DomainError);
  });
});

describe('product handlers', () => {
  it('delegates conflict detection to the product conflict service', async () => {
    const conflicts: ConflictDetectionResult = {
      duplicateRowsInFile: [],
      exactDuplicateRows: [],
      existingProducts: [],
      duplicateProductCodes: [],
      cleanRows: [2],
      summary: {
        totalChecked: 1,
        exactDuplicateRowCount: 0,
        exactDuplicateNameCount: 0,
        conflictingDuplicateRowCount: 0,
        conflictingDuplicateNameCount: 0,
        duplicateNameCount: 0,
        duplicateRowCount: 0,
        existingProductCount: 0,
        existingProductNameCount: 0,
        cleanRowCount: 1,
        duplicateProductCodeCount: 0,
      },
    };
    vi.mocked(detectProductImportConflictsForOrg).mockResolvedValue(conflicts);

    const handler = assertImportConflictSupported('product');
    const report = productReport([
      { rowNumber: 2, values: { name: 'Bread' }, issues: [], status: 'valid' },
    ]);

    await expect(handler(report, { db, orgId: 'org-1' })).resolves.toBe(conflicts);
    expect(detectProductImportConflictsForOrg).toHaveBeenCalledWith(report, db, 'org-1');
  });

  it('delegates commit to the product resolution service', async () => {
    const conflicts: ConflictDetectionResult = {
      duplicateRowsInFile: [],
      exactDuplicateRows: [],
      existingProducts: [],
      duplicateProductCodes: [],
      cleanRows: [2],
      summary: {
        totalChecked: 1,
        exactDuplicateRowCount: 0,
        exactDuplicateNameCount: 0,
        conflictingDuplicateRowCount: 0,
        conflictingDuplicateNameCount: 0,
        duplicateNameCount: 0,
        duplicateRowCount: 0,
        existingProductCount: 0,
        existingProductNameCount: 0,
        cleanRowCount: 1,
        duplicateProductCodeCount: 0,
      },
    };
    vi.mocked(commitProductImportWithResolution).mockResolvedValue({
      importedCount: 1,
      skippedCount: 0,
      failedCount: 0,
      documentIds: ['doc-1'],
      rowResults: [],
      commitErrors: [],
      updatedCount: 0,
      updatedDocumentIds: [],
      skippedExistingCount: 0,
      skippedExactDuplicateCount: 0,
    });

    const handler = getImportCommitHandler('product')!;
    const report = productReport([
      { rowNumber: 2, values: { name: 'Bread' }, issues: [], status: 'valid' },
    ]);

    await handler(report, conflicts, 'new-only', context);

    expect(commitProductImportWithResolution).toHaveBeenCalledWith(
      db,
      report,
      conflicts,
      'new-only',
      { orgId: 'org-1', userId: 'user-1' },
    );
  });
});

describe('sale handlers', () => {
  it('runs grouping, resolution, and conflict detection for sales', async () => {
    const grouped = [{ groupKey: 'number:SAL-1', lines: [], rowNumbers: [2], header: {}, groupIssues: [] }];
    const resolved = [{ ...grouped[0], lines: [] }];
    const conflicts = {
      cleanGroups: resolved,
      conflictingGroups: [],
      exactDuplicateSales: [],
      conflictingDuplicateSales: [],
      existingSales: [],
      summary: {
        totalChecked: 1,
        exactDuplicateGroupCount: 0,
        exactDuplicateSaleCount: 0,
        conflictingDuplicateGroupCount: 0,
        conflictingDuplicateSaleCount: 0,
        existingSaleCount: 0,
        cleanGroupCount: 1,
        conflictingGroupCount: 0,
        lineErrorGroupCount: 0,
        groupIssueGroupCount: 0,
      },
    };

    vi.mocked(groupSaleImportRows).mockReturnValue(grouped as never);
    vi.mocked(resolveSaleImportProductsForOrg).mockResolvedValue(resolved as never);
    vi.mocked(detectSaleImportConflictsForOrg).mockResolvedValue(conflicts as never);

    const handler = assertImportConflictSupported('sale');
    const report = saleReport([
      {
        rowNumber: 2,
        values: { saleNumber: 'SAL-1', saleDate: '2026-03-15', productName: 'Bread', quantity: 1 },
        issues: [],
        status: 'valid',
      },
    ]);

    await expect(handler(report, { db, orgId: 'org-1' })).resolves.toBe(conflicts);

    expect(groupSaleImportRows).toHaveBeenCalledWith(report.result.rows);
    expect(resolveSaleImportProductsForOrg).toHaveBeenCalledWith(grouped, db, 'org-1');
    expect(detectSaleImportConflictsForOrg).toHaveBeenCalledWith(resolved, db, 'org-1');
  });

  it('commits only clean sale groups through the sale commit service', async () => {
    const cleanGroups = [{ groupKey: 'number:SAL-1', lines: [], rowNumbers: [2], header: {}, groupIssues: [] }];
    const conflicts = {
      cleanGroups,
      conflictingGroups: [],
      exactDuplicateSales: [],
      conflictingDuplicateSales: [],
      existingSales: [],
      summary: {
        totalChecked: 1,
        exactDuplicateGroupCount: 0,
        exactDuplicateSaleCount: 0,
        conflictingDuplicateGroupCount: 0,
        conflictingDuplicateSaleCount: 0,
        existingSaleCount: 0,
        cleanGroupCount: 1,
        conflictingGroupCount: 0,
        lineErrorGroupCount: 0,
        groupIssueGroupCount: 0,
      },
    };

    vi.mocked(commitSaleImport).mockResolvedValue({
      importedCount: 1,
      skippedCount: 0,
      failedCount: 0,
      saleIds: ['sale-1'],
      saleNumbers: ['SAL-1'],
      groupResults: [],
      commitErrors: [],
    });

    const handler = getImportCommitHandler('sale')!;
    const report = saleReport([]);

    await handler(report, conflicts as never, 'new-only', context);

    expect(commitSaleImport).toHaveBeenCalledWith(cleanGroups, {
      orgId: 'org-1',
      userId: 'user-1',
    });
  });

  it('rejects update-existing strategy for sales import', async () => {
    const handler = getImportCommitHandler('sale')!;
    const conflicts = {
      cleanGroups: [],
      conflictingGroups: [],
      exactDuplicateSales: [],
      conflictingDuplicateSales: [],
      existingSales: [],
      summary: {
        totalChecked: 0,
        exactDuplicateGroupCount: 0,
        exactDuplicateSaleCount: 0,
        conflictingDuplicateGroupCount: 0,
        conflictingDuplicateSaleCount: 0,
        existingSaleCount: 0,
        cleanGroupCount: 0,
        conflictingGroupCount: 0,
        lineErrorGroupCount: 0,
        groupIssueGroupCount: 0,
      },
    };

    await expect(
      handler(saleReport([]), conflicts as never, 'update-existing', context),
    ).rejects.toThrow(/only supports importing new sales/);
  });

  it('runs the sale pipeline for legacy commit', async () => {
    vi.mocked(groupSaleImportRows).mockReturnValue([]);
    vi.mocked(resolveSaleImportProductsForOrg).mockResolvedValue([]);
    vi.mocked(detectSaleImportConflictsForOrg).mockResolvedValue({
      cleanGroups: [],
      conflictingGroups: [],
      exactDuplicateSales: [],
      conflictingDuplicateSales: [],
      existingSales: [],
      summary: {
        totalChecked: 0,
        exactDuplicateGroupCount: 0,
        exactDuplicateSaleCount: 0,
        conflictingDuplicateGroupCount: 0,
        conflictingDuplicateSaleCount: 0,
        existingSaleCount: 0,
        cleanGroupCount: 0,
        conflictingGroupCount: 0,
        lineErrorGroupCount: 0,
        groupIssueGroupCount: 0,
      },
    } as never);
    vi.mocked(commitSaleImport).mockResolvedValue({
      importedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      saleIds: [],
      saleNumbers: [],
      groupResults: [],
      commitErrors: [],
    });

    const handler = assertImportLegacyCommitSupported('sale');
    await handler(saleReport([]), context);

    expect(commitSaleImport).toHaveBeenCalled();
  });
});
