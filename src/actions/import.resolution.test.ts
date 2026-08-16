/**
 * Integration tests for commitImportWithResolutionAction — auth, strategy
 * routing, and delegation to the resolution service.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainError } from '@/lib/domain/errors';
import type { ValidatedRow } from '@/lib/import/engine/types';
import type { ConflictDetectionResult } from '@/lib/import/services/conflict.service';
import type { ImportRunReport } from '@/lib/import/services/import.service';

vi.mock('@/lib/firebase/auth-server', () => ({
  getAuthenticatedContext: vi.fn(),
}));

vi.mock('@/lib/repositories/base.repository', () => ({
  getFirestore: vi.fn(),
}));

vi.mock('@/lib/import/services/conflict-resolution.service', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/import/services/conflict-resolution.service')
  >();

  return {
    ...actual,
    commitProductImportWithResolution: vi.fn(),
  };
});

import { commitImportWithResolutionAction } from '@/actions/import';
import { commitProductImportWithResolution } from '@/lib/import/services/conflict-resolution.service';
import { getAuthenticatedContext } from '@/lib/firebase/auth-server';
import { getFirestore } from '@/lib/repositories/base.repository';

function validRow(rowNumber: number, name = `Item ${rowNumber}`): ValidatedRow {
  return {
    rowNumber,
    values: { name, sellingPrice: 45 },
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

const noConflicts: ConflictDetectionResult = {
  duplicateRowsInFile: [],
  exactDuplicateRows: [],
  existingProducts: [],
  duplicateProductCodes: [],
  cleanRows: [2, 3],
  summary: {
    totalChecked: 2,
    exactDuplicateRowCount: 0,
    exactDuplicateNameCount: 0,
    conflictingDuplicateRowCount: 0,
    conflictingDuplicateNameCount: 0,
    duplicateNameCount: 0,
    duplicateRowCount: 0,
    existingProductCount: 0,
    existingProductNameCount: 0,
    cleanRowCount: 2,
    duplicateProductCodeCount: 0,
  },
};

beforeEach(() => {
  vi.mocked(getAuthenticatedContext).mockReset();
  vi.mocked(getFirestore).mockReset();
  vi.mocked(commitProductImportWithResolution).mockReset();
});

function grantOrgContext() {
  vi.mocked(getAuthenticatedContext).mockResolvedValue({ orgId: 'org-1', userId: 'user-1', role: 'owner' });
}

describe('commitImportWithResolutionAction', () => {
  it('delegates new-only strategy to the resolution service', async () => {
    grantOrgContext();
    const db = {} as Firestore;
    vi.mocked(getFirestore).mockReturnValue(db);
    vi.mocked(commitProductImportWithResolution).mockResolvedValue({
      importedCount: 2,
      skippedCount: 0,
      skippedExistingCount: 0,
      skippedExactDuplicateCount: 0,
      failedCount: 0,
      updatedCount: 0,
      documentIds: ['doc-1', 'doc-2'],
      updatedDocumentIds: [],
      rowResults: [],
      commitErrors: [],
    });

    const report = productReport([validRow(2), validRow(3)]);
    const result = await commitImportWithResolutionAction(report, noConflicts, 'new-only');

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.strategy).toBe('new-only');
      expect(result.data.result.importedCount).toBe(2);
      expect(result.data.durationMs).toBeGreaterThanOrEqual(0);
    }

    expect(vi.mocked(commitProductImportWithResolution)).toHaveBeenCalledWith(
      db,
      report,
      noConflicts,
      'new-only',
      { orgId: 'org-1', userId: 'user-1' },
    );
  });

  it('delegates update-existing strategy to the resolution service', async () => {
    grantOrgContext();
    const db = {} as Firestore;
    vi.mocked(getFirestore).mockReturnValue(db);
    vi.mocked(commitProductImportWithResolution).mockResolvedValue({
      importedCount: 1,
      skippedCount: 0,
      skippedExistingCount: 0,
      skippedExactDuplicateCount: 0,
      failedCount: 0,
      updatedCount: 1,
      documentIds: ['doc-2'],
      updatedDocumentIds: ['p1'],
      rowResults: [],
      commitErrors: [],
    });

    const report = productReport([validRow(2, 'Milk Bread'), validRow(3, 'Veg Puff')]);
    const conflicts: ConflictDetectionResult = {
      ...noConflicts,
      existingProducts: [
        {
          rowNumber: 2,
          name: 'Milk Bread',
          normalizedName: 'milk bread',
          existingProduct: { id: 'p1', name: 'Milk Bread', code: 'MB-1' },
        },
      ],
      cleanRows: [3],
      summary: {
        totalChecked: 2,
        exactDuplicateRowCount: 0,
        exactDuplicateNameCount: 0,
        conflictingDuplicateRowCount: 0,
        conflictingDuplicateNameCount: 0,
        duplicateNameCount: 0,
        duplicateRowCount: 0,
        existingProductCount: 1,
        existingProductNameCount: 1,
        cleanRowCount: 1,
        duplicateProductCodeCount: 0,
      },
    };

    const result = await commitImportWithResolutionAction(
      report,
      conflicts,
      'update-existing',
    );

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.strategy).toBe('update-existing');
      expect('updatedCount' in result.data.result && result.data.result.updatedCount).toBe(1);
    }

    expect(vi.mocked(commitProductImportWithResolution)).toHaveBeenCalledWith(
      db,
      report,
      conflicts,
      'update-existing',
      { orgId: 'org-1', userId: 'user-1' },
    );
  });

  it('fails without touching Firestore when org context is missing', async () => {
    vi.mocked(getAuthenticatedContext).mockRejectedValue(
      new DomainError('USER_NOT_FOUND', 'User profile not found. Complete bakery setup to continue.'),
    );

    const result = await commitImportWithResolutionAction(
      productReport([validRow(2)]),
      noConflicts,
      'new-only',
    );

    expect(result).toMatchObject({ success: false, code: 'USER_NOT_FOUND' });
    expect(vi.mocked(getFirestore)).not.toHaveBeenCalled();
    expect(vi.mocked(commitProductImportWithResolution)).not.toHaveBeenCalled();
  });

  it('uses authenticated session orgId and never a client-supplied organization', async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      orgId: 'org-a',
      userId: 'user-a',
      role: 'owner',
    });
    const db = {} as Firestore;
    vi.mocked(getFirestore).mockReturnValue(db);
    vi.mocked(commitProductImportWithResolution).mockResolvedValue({
      importedCount: 1,
      skippedCount: 0,
      skippedExistingCount: 0,
      skippedExactDuplicateCount: 0,
      failedCount: 0,
      updatedCount: 0,
      documentIds: ['doc-1'],
      updatedDocumentIds: [],
      rowResults: [],
      commitErrors: [],
    });

    const report = productReport([validRow(2)]);
    const result = await commitImportWithResolutionAction(
      report,
      noConflicts,
      'new-only',
      { saveMapping: false },
    );

    expect(result.success).toBe(true);
    expect(vi.mocked(commitProductImportWithResolution)).toHaveBeenCalledWith(
      db,
      report,
      noConflicts,
      'new-only',
      { orgId: 'org-a', userId: 'user-a' },
    );
    expect(vi.mocked(commitProductImportWithResolution)).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ orgId: 'org-b' }),
    );
  });

  it('blocks sales from committing a product import', async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      orgId: 'org-1',
      userId: 'sales-1',
      role: 'sales',
    });

    const result = await commitImportWithResolutionAction(
      productReport([validRow(2)]),
      noConflicts,
      'new-only',
    );

    expect(result).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
    expect(vi.mocked(getFirestore)).not.toHaveBeenCalled();
    expect(vi.mocked(commitProductImportWithResolution)).not.toHaveBeenCalled();
  });
});
