/**
 * Phase 4B — Firebase Emulator proof tests for duplicate index.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-bakeryos-phase4b -- "npx vitest run src/lib/import/import-duplicate-index.emulator.test.ts src/lib/import/sale-import-concurrency.emulator.test.ts"
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
  process.env.GCLOUD_PROJECT = 'demo-bakeryos-phase4b';
  process.env.GOOGLE_CLOUD_PROJECT = 'demo-bakeryos-phase4b';
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-bakeryos-phase4b' });
  delete process.env.FIREBASE_ADMIN_PROJECT_ID;
  delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
});

vi.mock('@/lib/firebase/admin', async () => {
  const { getApps, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  function getEmulatorFirestore() {
    const existing = getApps().find((app) => app.name === 'phase4b-index');
    const app =
      existing ?? initializeApp({ projectId: 'demo-bakeryos-phase4b' }, 'phase4b-index');

    return getFirestore(app);
  }

  return {
    getAdminFirestore: getEmulatorFirestore,
  };
});

import { Timestamp } from 'firebase-admin/firestore';

import {
  buildDuplicateImportFileFingerprint,
  buildDuplicateImportRowFingerprint,
} from '@/lib/import/duplicate/duplicate-import.service';
import {
  compareDuplicateDetectionPaths,
  lookupCandidateImportIdsFromIndex,
} from '@/lib/import/duplicate/import-duplicate-index-candidate.service';
import { importIndexRepairService } from '@/lib/import/duplicate/import-index-repair.service';
import {
  DUPLICATE_IMPORT_STATUS,
  IMPORT_HISTORY_STATUS,
  type ImportHistoryRecord,
} from '@/lib/import/duplicate';
import { getAdminFirestore } from '@/lib/firebase/admin';
import {
  IMPORT_DUPLICATE_INDEX_MAX_BATCH_WRITES,
  importDuplicateIndexRepository,
} from '@/lib/repositories/import-duplicate-index.repository';
import { hashImportIdentity, importHistoryRepository } from '@/lib/repositories/import-history.repository';

const USER = 'phase4b-user';

function orgId(suffix: string) {
  return `org-p4b-${suffix}-${Math.random().toString(36).slice(2, 8)}`;
}

async function emulatorIsUp(): Promise<boolean> {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';

  try {
    const response = await fetch(`http://${host}/`);
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

async function seedImportHistory(
  orgId: string,
  record: ImportHistoryRecord,
): Promise<void> {
  const now = Timestamp.now();
  const ref = getAdminFirestore()
    .collection('organizations')
    .doc(orgId)
    .collection('importHistory')
    .doc(record.importId);

  await ref.set({
    organizationId: orgId,
    reportType: record.reportType,
    rowCount: record.rowCount,
    rowsImported: record.rowCount,
    rowsSkipped: 0,
    rowsFailed: 0,
    fileFingerprint: record.fileFingerprint,
    invoiceNumbers: [...record.invoiceNumbers],
    rowFingerprints: [...record.rowFingerprints],
    saleIds: [],
    executionStatus: 'IMPORTED',
    status: record.status,
    createdAt: now,
    createdBy: USER,
    updatedAt: now,
    updatedBy: USER,
    deletedAt: null,
    deletedBy: null,
  });
}

function syntheticRows(count: number, numbered = true) {
  return Array.from({ length: count }, (_, index) => ({
    saleDate: '2026-03-01',
    customerName: `Store ${index % 50}`,
    productName: 'Bread',
    quantity: 1,
    saleNumber: numbered ? `INV-${index}` : undefined,
  }));
}

function rowFingerprint(values: Record<string, unknown>) {
  return buildDuplicateImportRowFingerprint({
    rowNumber: 2,
    originalValues: values,
    normalizedValues: values as never,
    reportDetectionResult: {} as never,
    productMatchResult: {
      matchedProductId: 'prod-bread',
    } as never,
    conflictEngineResult: {} as never,
    confidenceResult: {} as never,
  });
}

async function startTogether<T>(workers: Array<() => Promise<T>>): Promise<PromiseSettledResult<T>[]> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = workers.map(async (worker) => {
    await gate;
    return worker();
  });
  release();
  return Promise.allSettled(started);
}

async function countIndexHits(orgId: string, importId: string) {
  const db = getAdminFirestore();
  const hitsSnap = await db
    .collectionGroup('hits')
    .where('organizationId', '==', orgId)
    .where('importId', '==', importId)
    .get();

  let invoiceHits = 0;
  let rowHits = 0;

  for (const doc of hitsSnap.docs) {
    if (doc.ref.path.includes('/importDuplicateInvoices/')) {
      invoiceHits += 1;
    } else if (doc.ref.path.includes('/importDuplicateRows/')) {
      rowHits += 1;
    }
  }

  return { invoiceHits, rowHits, total: hitsSnap.size };
}

const emulatorReady = await emulatorIsUp();

describe.skipIf(!emulatorReady)('Phase 4B Firestore emulator — duplicate index proof', () => {
  beforeAll(() => {
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
    expect(process.env.FIREBASE_ADMIN_PRIVATE_KEY).toBeUndefined();
  });

  it('TEST 3 — partial batch failure then repair restores complete index', async () => {
    const org = orgId('partial');
    const importId = 'imp-partial-emulator';
    const invoiceCount = 500;
    const rowCount = 200;
    const invoiceNumbers = Array.from({ length: invoiceCount }, (_, index) => `INV-${index}`);
    const rowFingerprints = Array.from({ length: rowCount }, (_, index) => `row-${index}`);
    const firestore = getAdminFirestore();
    let batchIndex = 0;

    const originalBatch = firestore.batch.bind(firestore);
    vi.spyOn(firestore, 'batch').mockImplementation(() => {
      const current = batchIndex++;
      const batch = originalBatch();
      const originalCommit = batch.commit.bind(batch);

      batch.commit = async () => {
        if (current === 1) {
          throw new Error('Simulated batch failure');
        }

        return originalCommit();
      };

      return batch;
    });

    const failed = await importDuplicateIndexRepository.indexImportDuplicateHits(org, USER, {
      importId,
      invoiceNumbers,
      rowFingerprints,
      status: IMPORT_HISTORY_STATUS.IMPORTING,
    });

    expect(failed.success).toBe(false);

    vi.restoreAllMocks();

    const partialCounts = await countIndexHits(org, importId);
    expect(partialCounts.invoiceHits + partialCounts.rowHits).toBe(
      IMPORT_DUPLICATE_INDEX_MAX_BATCH_WRITES,
    );

    const repaired = await importDuplicateIndexRepository.indexImportDuplicateHits(org, USER, {
      importId,
      invoiceNumbers,
      rowFingerprints,
      status: IMPORT_HISTORY_STATUS.COMPLETED,
    });

    expect(repaired.success).toBe(true);
    expect(repaired.invoiceHitsWritten).toBe(invoiceCount);
    expect(repaired.rowHitsWritten).toBe(rowCount);
    expect(repaired.batchesCommitted).toBe(Math.ceil((invoiceCount + rowCount) / IMPORT_DUPLICATE_INDEX_MAX_BATCH_WRITES));

    const finalCounts = await countIndexHits(org, importId);
    expect(finalCounts.invoiceHits).toBe(invoiceCount);
    expect(finalCounts.rowHits).toBe(rowCount);
  }, 120_000);

  it('TEST 4 — large synthetic imports batch within Firestore limits', async () => {
    const org = orgId('large');
    const sizes = [100, 1000, 2000] as const;
    const metrics: Array<{
      rows: number;
      invoiceHits: number;
      rowHits: number;
      writes: number;
      batches: number;
    }> = [];

    for (const size of sizes) {
      const importId = `imp-large-${size}`;
      const values = syntheticRows(size);
      const rowFingerprints = values.map((value) => rowFingerprint(value));
      const invoiceNumbers = values
        .map((value) => value.saleNumber)
        .filter((value): value is string => typeof value === 'string');

      const result = await importDuplicateIndexRepository.indexImportDuplicateHits(org, USER, {
        importId,
        invoiceNumbers,
        rowFingerprints,
        status: IMPORT_HISTORY_STATUS.COMPLETED,
      });

      expect(result.success).toBe(true);
      expect(result.invoiceHitsWritten).toBe(size);
      expect(result.rowHitsWritten).toBe(size);
      expect(result.batchesCommitted).toBe(Math.ceil((size + size) / IMPORT_DUPLICATE_INDEX_MAX_BATCH_WRITES));

      metrics.push({
        rows: size,
        invoiceHits: result.invoiceHitsWritten,
        rowHits: result.rowHitsWritten,
        writes: result.invoiceHitsWritten + result.rowHitsWritten,
        batches: result.batchesCommitted,
      });
    }

    expect(metrics).toEqual([
      { rows: 100, invoiceHits: 100, rowHits: 100, writes: 200, batches: 1 },
      { rows: 1000, invoiceHits: 1000, rowHits: 1000, writes: 2000, batches: 5 },
      { rows: 2000, invoiceHits: 2000, rowHits: 2000, writes: 4000, batches: 9 },
    ]);
  }, 180_000);

  it('TEST 4b — 10000-row synthetic import completes in emulator', async () => {
    const org = orgId('10k');
    const size = 10_000;
    const importId = 'imp-10k';
    const values = syntheticRows(size);
    const rowFingerprints = values.map((value) => rowFingerprint(value));
    const invoiceNumbers = values
      .map((value) => value.saleNumber)
      .filter((value): value is string => typeof value === 'string');

    const result = await importDuplicateIndexRepository.indexImportDuplicateHits(org, USER, {
      importId,
      invoiceNumbers,
      rowFingerprints,
      status: IMPORT_HISTORY_STATUS.COMPLETED,
    });

    expect(result.success).toBe(true);
    expect(result.invoiceHitsWritten).toBe(size);
    expect(result.rowHitsWritten).toBe(size);
    expect(result.batchesCommitted).toBe(Math.ceil((size + size) / IMPORT_DUPLICATE_INDEX_MAX_BATCH_WRITES));
  }, 300_000);

  it('TEST 5 — organization isolation on emulator', async () => {
    const orgA = orgId('iso-a');
    const orgB = orgId('iso-b');
    const input = {
      importId: 'imp-shared-invoice',
      invoiceNumbers: ['INV-100'],
      rowFingerprints: ['row-shared'],
      status: IMPORT_HISTORY_STATUS.COMPLETED,
    } as const;

    await importDuplicateIndexRepository.indexImportDuplicateHits(orgA, USER, input);
    await importDuplicateIndexRepository.indexImportDuplicateHits(orgB, USER, {
      ...input,
      importId: 'imp-shared-invoice-b',
    });

    const candidatesA = await lookupCandidateImportIdsFromIndex(orgA, {
      fileFingerprint: '',
      invoiceNumbers: ['INV-100'],
      rowFingerprints: ['row-shared'],
    });
    const candidatesB = await lookupCandidateImportIdsFromIndex(orgB, {
      fileFingerprint: '',
      invoiceNumbers: ['INV-100'],
      rowFingerprints: ['row-shared'],
    });

    expect([...candidatesA.candidateIds]).toEqual(['imp-shared-invoice']);
    expect([...candidatesB.candidateIds]).toEqual(['imp-shared-invoice-b']);
  }, 60_000);

  it('TEST 6 — concurrent index writes converge to one hit per hash/importId', async () => {
    const org = orgId('concurrent');
    const importId = 'imp-concurrent';
    const input = {
      importId,
      invoiceNumbers: ['INV-1', 'INV-2', 'INV-3'],
      rowFingerprints: ['row-a', 'row-b', 'row-c', 'row-d'],
      status: IMPORT_HISTORY_STATUS.IMPORTING,
    } as const;

    const results = await startTogether([
      () => importDuplicateIndexRepository.indexImportDuplicateHits(org, USER, input),
      () => importDuplicateIndexRepository.indexImportDuplicateHits(org, USER, input),
    ]);

    expect(results.every((entry) => entry.status === 'fulfilled')).toBe(true);

    const counts = await countIndexHits(org, importId);
    expect(counts.invoiceHits).toBe(3);
    expect(counts.rowHits).toBe(4);
  }, 60_000);

  it('OLD vs NEW parity on emulator with seeded history and index', async () => {
    const org = orgId('parity');
    const values = syntheticRows(20);
    const rowFingerprints = values.map((value) => rowFingerprint(value));
    const invoiceNumbers = values
      .map((value) => value.saleNumber)
      .filter((value): value is string => typeof value === 'string');
    const fileFingerprint = buildDuplicateImportFileFingerprint(rowFingerprints);
    const history: ImportHistoryRecord = {
      importId: 'imp-history',
      importedAt: '2026-03-01T10:00:00.000Z',
      importedBy: USER,
      reportType: 'sales-detail',
      rowCount: 20,
      fileFingerprint,
      invoiceNumbers,
      rowFingerprints,
      status: IMPORT_HISTORY_STATUS.COMPLETED,
    };

    await seedImportHistory(org, history);
    await importDuplicateIndexRepository.indexImportDuplicateHits(org, USER, {
      importId: history.importId,
      invoiceNumbers: history.invoiceNumbers,
      rowFingerprints: history.rowFingerprints,
      status: history.status,
    });
    await importIndexRepairService.repairOrganizationIndex(org, USER);

    const currentRows = values.map((value, index) => ({
      rowNumber: index + 2,
      originalValues: value,
      normalizedValues: value as never,
      reportDetectionResult: {} as never,
      productMatchResult: { matchedProductId: 'prod-bread' } as never,
      conflictEngineResult: {} as never,
      confidenceResult: {} as never,
    }));

    const parity = await compareDuplicateDetectionPaths(org, {
      resolvedReview: {
        overview: {} as never,
        reportSummary: {} as never,
        rows: currentRows,
      },
      importHistory: [history],
    });

    expect(parity.matches).toBe(true);
    expect(parity.oldResult.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    expect(parity.candidateHistoryCount).toBe(1);
    expect(parity.fullHistoryCount).toBe(1);
  }, 60_000);
});

describe.skipIf(emulatorReady)('Phase 4B Firestore emulator — unavailable', () => {
  it('does not claim emulator success without Firestore emulator', () => {
    expect(emulatorReady).toBe(false);
  });
});
