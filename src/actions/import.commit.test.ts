/**
 * Integration tests for commitImportAction — the thin server action that
 * authenticates, delegates to the existing commit service, and returns a
 * CommitResult. Firestore and org context are mocked; the real commit
 * service runs.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainError } from '@/lib/domain/errors';
import type { ValidatedRow } from '@/lib/import/engine/types';
import type { ImportRunReport } from '@/lib/import/services/import.service';

vi.mock('@/lib/firebase/auth-server', () => ({
  getServerOrgContext: vi.fn(),
}));

vi.mock('@/lib/repositories/base.repository', () => ({
  getFirestore: vi.fn(),
}));

import { commitImportAction } from '@/actions/import';
import { getServerOrgContext } from '@/lib/firebase/auth-server';
import { getFirestore } from '@/lib/repositories/base.repository';

// ---------------------------------------------------------------------------
// Mocked Firestore (same surface the commit service touches)
// ---------------------------------------------------------------------------

function createFakeFirestore(failBatchIndexes: readonly number[] = []) {
  let docCounter = 0;
  let batchCounter = 0;
  const committed: { id: string; data: Record<string, unknown> }[] = [];

  const db = {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({ id: `doc-${++docCounter}` }),
        }),
      }),
    }),
    batch: () => {
      const batchIndex = batchCounter++;
      const writes: { id: string; data: Record<string, unknown> }[] = [];

      return {
        set: (ref: { id: string }, data: Record<string, unknown>) => {
          writes.push({ id: ref.id, data });
        },
        commit: async () => {
          if (failBatchIndexes.includes(batchIndex)) {
            throw new Error('Firestore unavailable');
          }

          committed.push(...writes);
        },
      };
    },
  };

  return { db: db as unknown as Firestore, committed };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function validRow(rowNumber: number): ValidatedRow {
  return {
    rowNumber,
    values: { name: `Item ${rowNumber}`, sellingPrice: 45 },
    issues: [],
    status: 'valid',
  };
}

function productReport(rows: ValidatedRow[]): ImportRunReport {
  const errorRows = rows.filter((row) => row.status === 'error').length;
  const warningRows = rows.filter((row) => row.status === 'warning').length;

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
        validRows: rows.length - errorRows - warningRows,
        warningRows,
        errorRows,
      },
    },
  };
}

beforeEach(() => {
  vi.mocked(getServerOrgContext).mockReset();
  vi.mocked(getFirestore).mockReset();
});

function grantOrgContext() {
  vi.mocked(getServerOrgContext).mockResolvedValue({ orgId: 'org-1', userId: 'user-1' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('commitImportAction', () => {
  it('imports valid rows and returns the commit result with a duration', async () => {
    grantOrgContext();
    const { db, committed } = createFakeFirestore();
    vi.mocked(getFirestore).mockReturnValue(db);

    const result = await commitImportAction(productReport([validRow(2), validRow(3)]));

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.result.importedCount).toBe(2);
      expect(result.data.result.failedCount).toBe(0);
      expect(result.data.result.documentIds).toHaveLength(2);
      expect(result.data.durationMs).toBeGreaterThanOrEqual(0);
    }

    expect(committed).toHaveLength(2);
    // Documents carry the authenticated org and user.
    expect(committed[0]?.data).toMatchObject({
      organizationId: 'org-1',
      createdBy: 'user-1',
    });
  });

  it('skips error rows instead of writing them', async () => {
    grantOrgContext();
    const { db, committed } = createFakeFirestore();
    vi.mocked(getFirestore).mockReturnValue(db);

    const errorRow: ValidatedRow = {
      rowNumber: 3,
      values: { name: null },
      issues: [],
      status: 'error',
    };

    const result = await commitImportAction(productReport([validRow(2), errorRow]));

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.result.importedCount).toBe(1);
      expect(result.data.result.skippedCount).toBe(1);
    }

    expect(committed).toHaveLength(1);
  });

  it('reports a partial failure when one batch fails (rows > batch size)', async () => {
    grantOrgContext();
    // 450 rows → two batches of 400 + 50; fail the second one.
    const { db, committed } = createFakeFirestore([1]);
    vi.mocked(getFirestore).mockReturnValue(db);

    const rows = Array.from({ length: 450 }, (_, index) => validRow(index + 2));
    const result = await commitImportAction(productReport(rows));

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.result.importedCount).toBe(400);
      expect(result.data.result.failedCount).toBe(50);
      expect(result.data.result.commitErrors).toHaveLength(1);
      expect(result.data.result.commitErrors[0]?.message).toBe('Firestore unavailable');
    }

    expect(committed).toHaveLength(400);
  });

  it('reports total failure when every batch fails, without throwing', async () => {
    grantOrgContext();
    const { db } = createFakeFirestore([0]);
    vi.mocked(getFirestore).mockReturnValue(db);

    const result = await commitImportAction(productReport([validRow(2)]));

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.result.importedCount).toBe(0);
      expect(result.data.result.failedCount).toBe(1);
    }
  });

  it('fails with the org error when no organization is configured', async () => {
    vi.mocked(getServerOrgContext).mockRejectedValue(
      new DomainError(
        'ORG_NOT_CONFIGURED',
        'Organization context is not configured. Set DEV_ORG_ID in your environment.',
      ),
    );

    const result = await commitImportAction(productReport([validRow(2)]));

    expect(result).toMatchObject({
      success: false,
      code: 'ORG_NOT_CONFIGURED',
    });
    // Firestore must never be touched without an authenticated org.
    expect(vi.mocked(getFirestore)).not.toHaveBeenCalled();
  });

  it('rejects reports for entity types without a committer', async () => {
    grantOrgContext();

    const report = {
      ...productReport([validRow(2)]),
      entityType: 'supplier',
    } as unknown as ImportRunReport;

    const result = await commitImportAction(report);

    expect(result).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
  });
});
