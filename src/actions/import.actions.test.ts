/**
 * Integration tests for import action dispatch — product and sale entities.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainError } from '@/lib/domain/errors';
import type { ValidatedRow } from '@/lib/import/engine/types';
import type { ConflictDetectionResult } from '@/lib/import/services/conflict.service';

vi.mock('@/lib/firebase/auth-server', () => ({
  getServerOrgContext: vi.fn(),
}));

vi.mock('@/lib/repositories/base.repository', () => ({
  getFirestore: vi.fn(),
}));

vi.mock('@/lib/import/services/conflict.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/import/services/conflict.service')>()),
  detectProductImportConflictsForOrg: vi.fn(),
}));

vi.mock('@/lib/import/services/conflict-resolution.service', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/import/services/conflict-resolution.service')
  >()),
  commitProductImportWithResolution: vi.fn(),
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

import {
  commitImportWithResolutionAction,
  detectImportConflictsAction,
} from '@/actions/import';
import { getServerOrgContext } from '@/lib/firebase/auth-server';
import { commitProductImportWithResolution } from '@/lib/import/services/conflict-resolution.service';
import { detectProductImportConflictsForOrg } from '@/lib/import/services/conflict.service';
import type { ImportRunReport } from '@/lib/import/services/import.service';
import { commitSaleImport } from '@/lib/import/services/sale-import-commit.service';
import { detectSaleImportConflictsForOrg } from '@/lib/import/services/sale-conflict.service';
import { groupSaleImportRows } from '@/lib/import/services/sale-import-grouping.service';
import { resolveSaleImportProductsForOrg } from '@/lib/import/services/sale-import-product-resolver';
import { getFirestore } from '@/lib/repositories/base.repository';

function row(rowNumber: number, values: Record<string, unknown>): ValidatedRow {
  return {
    rowNumber,
    values: values as ValidatedRow['values'],
    issues: [],
    status: 'valid',
  };
}

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

const noProductConflicts: ConflictDetectionResult = {
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

beforeEach(() => {
  vi.mocked(getServerOrgContext).mockReset();
  vi.mocked(getFirestore).mockReset();
  vi.mocked(detectProductImportConflictsForOrg).mockReset();
  vi.mocked(commitProductImportWithResolution).mockReset();
  vi.mocked(groupSaleImportRows).mockReset();
  vi.mocked(resolveSaleImportProductsForOrg).mockReset();
  vi.mocked(detectSaleImportConflictsForOrg).mockReset();
  vi.mocked(commitSaleImport).mockReset();
});

function grantOrgContext() {
  vi.mocked(getServerOrgContext).mockResolvedValue({ orgId: 'org-1', userId: 'user-1' });
}

describe('detectImportConflictsAction', () => {
  it('dispatches product imports to the product conflict service', async () => {
    grantOrgContext();
    const db = {} as Firestore;
    vi.mocked(getFirestore).mockReturnValue(db);
    vi.mocked(detectProductImportConflictsForOrg).mockResolvedValue(noProductConflicts);

    const report = productReport([row(2, { name: 'Bread' })]);
    const result = await detectImportConflictsAction(report);

    expect(result.success).toBe(true);
    expect(detectProductImportConflictsForOrg).toHaveBeenCalledWith(report, db, 'org-1');
    expect(groupSaleImportRows).not.toHaveBeenCalled();
  });

  it('dispatches sale imports through the sale pipeline', async () => {
    grantOrgContext();
    const db = {} as Firestore;
    vi.mocked(getFirestore).mockReturnValue(db);

    const grouped = [{ groupKey: 'number:SAL-1' }];
    const resolved = [{ groupKey: 'number:SAL-1' }];
    const saleConflicts = {
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
    vi.mocked(detectSaleImportConflictsForOrg).mockResolvedValue(saleConflicts as never);

    const report = saleReport([
      row(2, {
        saleNumber: 'SAL-1',
        saleDate: '2026-03-15',
        productName: 'Bread',
        quantity: 1,
      }),
    ]);

    const result = await detectImportConflictsAction(report);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data).toBe(saleConflicts);
    }

    expect(groupSaleImportRows).toHaveBeenCalledWith(report.result.rows);
    expect(resolveSaleImportProductsForOrg).toHaveBeenCalledWith(grouped, db, 'org-1');
    expect(detectSaleImportConflictsForOrg).toHaveBeenCalledWith(resolved, db, 'org-1');
    expect(detectProductImportConflictsForOrg).not.toHaveBeenCalled();
  });

  it('rejects unsupported entity types', async () => {
    grantOrgContext();

    const report = {
      ...productReport([row(2, { name: 'Bread' })]),
      entityType: 'supplier',
    } as unknown as ImportRunReport;

    const result = await detectImportConflictsAction(report);

    expect(result).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
  });
});

describe('commitImportWithResolutionAction', () => {
  it('dispatches sale commits to the sale commit service', async () => {
    grantOrgContext();

    const cleanGroups = [{ groupKey: 'number:SAL-1' }];
    const saleConflicts = {
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

    const report = saleReport([]);
    const result = await commitImportWithResolutionAction(
      report,
      saleConflicts as never,
      'new-only',
    );

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.result).toMatchObject({ importedCount: 1, saleIds: ['sale-1'] });
    }

    expect(commitSaleImport).toHaveBeenCalledWith(cleanGroups, {
      orgId: 'org-1',
      userId: 'user-1',
    });
    expect(commitProductImportWithResolution).not.toHaveBeenCalled();
  });

  it('fails without touching services when org context is missing', async () => {
    vi.mocked(getServerOrgContext).mockRejectedValue(
      new DomainError('ORG_NOT_CONFIGURED', 'Organization context is not configured.'),
    );

    const result = await commitImportWithResolutionAction(
      saleReport([]),
      { cleanGroups: [] } as never,
      'new-only',
    );

    expect(result).toMatchObject({ success: false, code: 'ORG_NOT_CONFIGURED' });
    expect(commitSaleImport).not.toHaveBeenCalled();
  });
});
