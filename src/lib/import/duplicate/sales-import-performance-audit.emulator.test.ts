/**
 * Sales Import Performance Audit — Level 1 Firestore Emulator (TEST ONLY).
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-bakeryos-perf-audit -- "npx vitest run src/lib/import/duplicate/sales-import-performance-audit.emulator.test.ts"
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
  process.env.GCLOUD_PROJECT = 'demo-bakeryos-perf-audit';
  process.env.GOOGLE_CLOUD_PROJECT = 'demo-bakeryos-perf-audit';
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-bakeryos-perf-audit' });
  delete process.env.FIREBASE_ADMIN_PROJECT_ID;
  delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
});

vi.mock('@/lib/firebase/admin', async () => {
  const { getApps, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  function getEmulatorFirestore() {
    const existing = getApps().find((app) => app.name === 'perf-audit-emulator');
    const app =
      existing ?? initializeApp({ projectId: 'demo-bakeryos-perf-audit' }, 'perf-audit-emulator');

    return getFirestore(app);
  }

  return { getAdminFirestore: getEmulatorFirestore };
});

import { Timestamp, type Firestore, type WriteBatch } from 'firebase-admin/firestore';

import {
  detectDuplicateImport,
  DUPLICATE_IMPORT_STATUS,
  type ImportHistoryRecord,
} from '@/lib/import/duplicate';
import {
  resolveImportHistoryForDuplicateDetection,
} from '@/lib/import/duplicate/import-duplicate-index-candidate.service';
import { IMPORT_DUPLICATE_INDEX_STATUS } from '@/lib/import/duplicate/import-index-health.types';
import { importIndexRepairService } from '@/lib/import/duplicate/import-index-repair.service';
import {
  assertEmulatorTestEnvironment,
  buildAuditReview,
  buildAuditRow,
  buildExcelRows,
  emulatorIsReachable,
  historyReadsFromProbe,
  lightweightHistoryRecord,
  metaMode,
  PERFORMANCE_AUDIT_ROWS,
  probeImportHistoryRepository,
  recordAuditRow,
  rowFingerprintFromValues,
  type PerformanceAuditRow,
} from '@/lib/import/duplicate/sales-import-performance-audit.helpers';
import {
  markOrgIndexCoverageCompleteForTests,
  markOrgIndexCoverageIncompleteForTests,
} from '@/lib/import/duplicate/import-index-health.test-helpers';
import { getAdminFirestore } from '@/lib/firebase/admin';
import * as baseRepository from '@/lib/repositories/base.repository';
import { hashImportIdentity } from '@/lib/repositories/import-history.repository';

const USER = 'perf-emulator-user';
const BATCH_LIMIT = 450;

let emulatorWriteCount = 0;

function orgId(label: string) {
  return `org-perf-${label}-${Math.random().toString(36).slice(2, 8)}`;
}

function historyValues(index: number, size: number) {
  const invoice = `HIST-${size}-${index}`;
  return {
    saleDate: '2026-08-01',
    customerName: `Customer ${index % 200}`,
    productName: 'Bread',
    quantity: 1 + (index % 3),
    saleNumber: invoice,
  };
}

async function flushBatch(
  firestore: Firestore,
  batch: WriteBatch,
  opsInBatch: number,
): Promise<{ batch: WriteBatch; opsInBatch: number }> {
  if (opsInBatch === 0) {
    return { batch, opsInBatch };
  }

  await batch.commit();
  emulatorWriteCount += opsInBatch;
  return { batch: firestore.batch(), opsInBatch: 0 };
}

async function seedBulkCompleteIndex(
  orgId: string,
  count: number,
  options?: { targetIndex?: number; skipIndexForImportIds?: ReadonlySet<string> },
): Promise<{ targetRecord: ImportHistoryRecord | null }> {
  const firestore = getAdminFirestore();
  let batch = firestore.batch();
  let opsInBatch = 0;
  let targetRecord: ImportHistoryRecord | null = null;

  for (let index = 0; index < count; index += 1) {
    const importId = `imp-${index}`;
    const values = historyValues(index, count);
    const rowFp = rowFingerprintFromValues(values);
    const fileFp = `file-${count}-${index}`;
    const record = lightweightHistoryRecord(importId, values.saleNumber!, rowFp, fileFp);

    if (options?.targetIndex === index) {
      targetRecord = record;
    }

    const historyRef = firestore
      .collection('organizations')
      .doc(orgId)
      .collection('importHistory')
      .doc(importId);
    const now = Timestamp.now();

    batch.set(historyRef, {
      organizationId: orgId,
      reportType: record.reportType,
      rowCount: 1,
      rowsImported: 1,
      rowsSkipped: 0,
      rowsFailed: 0,
      fileFingerprint: record.fileFingerprint,
      invoiceNumbers: [...record.invoiceNumbers],
      rowFingerprints: [...record.rowFingerprints],
      saleIds: [],
      executionStatus: 'IMPORTED',
      status: record.status,
      duplicateIndexStatus: IMPORT_DUPLICATE_INDEX_STATUS.COMPLETE,
      createdAt: now,
      createdBy: USER,
      updatedAt: now,
      updatedBy: USER,
      deletedAt: null,
      deletedBy: null,
    });
    opsInBatch += 1;

    const skipIndex = options?.skipIndexForImportIds?.has(importId) ?? false;

    if (!skipIndex) {
      const invoiceHash = hashImportIdentity(values.saleNumber!.trim().toUpperCase());
      const rowHash = hashImportIdentity(rowFp);

      batch.set(
        firestore
          .collection('organizations')
          .doc(orgId)
          .collection('importDuplicateInvoices')
          .doc(invoiceHash)
          .collection('hits')
          .doc(importId),
        {
          organizationId: orgId,
          importId,
          invoiceNormalized: values.saleNumber!.trim().toUpperCase(),
          invoiceHash,
          status: record.status,
          indexedAt: now,
          createdBy: USER,
        },
      );
      opsInBatch += 1;

      batch.set(
        firestore
          .collection('organizations')
          .doc(orgId)
          .collection('importDuplicateRows')
          .doc(rowHash)
          .collection('hits')
          .doc(importId),
        {
          organizationId: orgId,
          importId,
          fingerprintHash: rowHash,
          status: record.status,
          indexedAt: now,
          createdBy: USER,
        },
      );
      opsInBatch += 1;
    }

    if (opsInBatch >= BATCH_LIMIT) {
      ({ batch, opsInBatch } = await flushBatch(firestore, batch, opsInBatch));
    }
  }

  ({ batch, opsInBatch } = await flushBatch(firestore, batch, opsInBatch));

  await markOrgIndexCoverageCompleteForTests(orgId, USER, count);

  return { targetRecord };
}

async function runHealthyNewFileAudit(historySize: number) {
  const org = orgId(`new-${historySize}`);
  await seedBulkCompleteIndex(org, historySize);

  const rows = buildExcelRows(10, `UPLOAD-NEW-${historySize}`);
  const probe = probeImportHistoryRepository();

  try {
    const started = performance.now();
    const resolved = await resolveImportHistoryForDuplicateDetection(org, buildAuditReview(rows));
    const elapsed = performance.now() - started;

    const duplicateResult = detectDuplicateImport({
      resolvedReview: buildAuditReview(rows),
      importHistory: resolved.importHistory,
    });

    expect(probe.listCalls, `list() must not run for ${historySize} complete index`).toBe(0);
    expect(probe.getByIdCalls).toBe(0);
    expect(historyReadsFromProbe(probe)).toBe(0);
    expect(duplicateResult.status).toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);
    expect(metaMode(resolved.meta)).toBe('complete');

    return recordAuditRow({
      history: historySize,
      excelRows: 10,
      mode: 'complete',
      indexReads: resolved.meta.indexLookupCount,
      historyReads: historyReadsFromProbe(probe),
      candidates: resolved.meta.candidateImportIds.length,
      timeMs: Math.round(elapsed),
      listCalls: probe.listCalls,
      getByIdCalls: probe.getByIdCalls,
      historyDocsMaterialized: historyReadsFromProbe(probe),
      note: 'emulator-measured',
    });
  } finally {
    probe.restore();
  }
}

const emulatorReady = await emulatorIsReachable();

describe.skipIf(!emulatorReady)('Level 1 — Firestore emulator performance audit', () => {
  beforeAll(() => {
    assertEmulatorTestEnvironment();
    emulatorWriteCount = 0;
  });

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.info('\n[Emulator performance audit rows]', PERFORMANCE_AUDIT_ROWS);
    // eslint-disable-next-line no-console
    console.info('[Emulator write count estimate]', emulatorWriteCount);
    // eslint-disable-next-line no-console
    console.info('[Production Firebase writes]', 0);
  });

  it('TEST A — healthy index / 1,000 history / 10-row new file', async () => {
    const row = await runHealthyNewFileAudit(1_000);
    expect(row.listCalls).toBe(0);
  }, 120_000);

  it('TEST A — healthy index / 10,000 history / 10-row new file', async () => {
    const row = await runHealthyNewFileAudit(10_000);
    expect(row.listCalls).toBe(0);
  }, 300_000);

  it('TEST A — healthy index / 20,000 history / 10-row new file', async () => {
    const row = await runHealthyNewFileAudit(20_000);
    expect(row.listCalls).toBe(0);
  }, 600_000);

  it('TEST B — healthy index / 10,000 history / known duplicate', async () => {
    const org = orgId('dup-10k');
    const targetIndex = 5_000;
    const { targetRecord } = await seedBulkCompleteIndex(org, 10_000, { targetIndex });
    expect(targetRecord).not.toBeNull();

    const targetValues = historyValues(targetIndex, 10_000);
    const rows = [buildAuditRow(2, targetValues)];
    const probe = probeImportHistoryRepository();

    try {
      const started = performance.now();
      const resolved = await resolveImportHistoryForDuplicateDetection(org, buildAuditReview(rows));
      const elapsed = performance.now() - started;

      const duplicateResult = detectDuplicateImport({
        resolvedReview: buildAuditReview(rows),
        importHistory: resolved.importHistory,
      });

      expect(probe.listCalls).toBe(0);
      expect(probe.getByIdCalls).toBeGreaterThan(0);
      expect(probe.getByIdCalls).toBeLessThanOrEqual(5);
      expect(historyReadsFromProbe(probe)).toBeLessThanOrEqual(5);
      expect(duplicateResult.status).not.toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);
      expect(duplicateResult.matchedImport?.importId).toBe(`imp-${targetIndex}`);

      recordAuditRow({
        history: 10_000,
        excelRows: 10,
        mode: 'complete-duplicate',
        indexReads: resolved.meta.indexLookupCount,
        historyReads: historyReadsFromProbe(probe),
        candidates: resolved.meta.candidateImportIds.length,
        timeMs: Math.round(elapsed),
        listCalls: probe.listCalls,
        getByIdCalls: probe.getByIdCalls,
        historyDocsMaterialized: historyReadsFromProbe(probe),
        note: 'emulator-measured duplicate',
      });
    } finally {
      probe.restore();
    }
  }, 300_000);

  it('TEST C — history scaling uses candidate-sized reads, not full scan', async () => {
    const scalingResults: PerformanceAuditRow[] = [];

    for (const size of [1_000, 10_000, 20_000] as const) {
      const org = orgId(`scale-${size}`);
      await seedBulkCompleteIndex(org, size);
      const rows = buildExcelRows(10, `SCALE-${size}`);
      const probe = probeImportHistoryRepository();

      try {
        const resolved = await resolveImportHistoryForDuplicateDetection(org, buildAuditReview(rows));
        expect(probe.listCalls).toBe(0);
        expect(historyReadsFromProbe(probe)).toBe(0);

        scalingResults.push(
          recordAuditRow({
            history: size,
            excelRows: 10,
            mode: 'complete-scaling',
            indexReads: resolved.meta.indexLookupCount,
            historyReads: historyReadsFromProbe(probe),
            candidates: resolved.meta.candidateImportIds.length,
            timeMs: 0,
            listCalls: probe.listCalls,
            getByIdCalls: probe.getByIdCalls,
            historyDocsMaterialized: historyReadsFromProbe(probe),
            note: 'TEST C scaling probe',
          }),
        );
      } finally {
        probe.restore();
      }
    }

    expect(scalingResults.map((entry) => entry.historyReads)).toEqual([0, 0, 0]);
    expect(scalingResults.map((entry) => entry.listCalls)).toEqual([0, 0, 0]);
  }, 900_000);

  it('TEST D — excel size scaling at 10,000 complete history', async () => {
    const org = orgId('excel-scale');
    await seedBulkCompleteIndex(org, 10_000);

    for (const rowCount of [10, 100] as const) {
      const rows = buildExcelRows(rowCount, `XL-${rowCount}`);
      const probe = probeImportHistoryRepository();

      try {
        const started = performance.now();
        const resolved = await resolveImportHistoryForDuplicateDetection(org, buildAuditReview(rows));
        const elapsed = performance.now() - started;

        expect(probe.listCalls).toBe(0);

        recordAuditRow({
          history: 10_000,
          excelRows: rowCount,
          mode: 'complete',
          indexReads: resolved.meta.indexLookupCount,
          historyReads: historyReadsFromProbe(probe),
          candidates: resolved.meta.candidateImportIds.length,
          timeMs: Math.round(elapsed),
          listCalls: probe.listCalls,
          getByIdCalls: probe.getByIdCalls,
          historyDocsMaterialized: historyReadsFromProbe(probe),
          note: 'TEST D excel scaling',
        });
      } finally {
        probe.restore();
      }
    }

    const rows1000 = buildExcelRows(1_000, 'XL-1000');
    const probe1000 = probeImportHistoryRepository();

    try {
      const started = performance.now();
      const resolved = await resolveImportHistoryForDuplicateDetection(org, buildAuditReview(rows1000));
      const elapsed = performance.now() - started;

      expect(probe1000.listCalls).toBe(0);

      recordAuditRow({
        history: 10_000,
        excelRows: 1_000,
        mode: 'complete',
        indexReads: resolved.meta.indexLookupCount,
        historyReads: historyReadsFromProbe(probe1000),
        candidates: resolved.meta.candidateImportIds.length,
        timeMs: Math.round(elapsed),
        listCalls: probe1000.listCalls,
        getByIdCalls: probe1000.getByIdCalls,
        historyDocsMaterialized: historyReadsFromProbe(probe1000),
        note: 'TEST D excel scaling (1000 rows — slow index lookups expected)',
      });
    } finally {
      probe1000.restore();
    }
  }, 900_000);

  it('TEST E — incomplete index uses full-history fallback safely', async () => {
    const org = orgId('incomplete-10k');
    const targetIndex = 7_500;
    await seedBulkCompleteIndex(org, 10_000, { targetIndex });
    await markOrgIndexCoverageIncompleteForTests(org, USER);

    const targetValues = historyValues(targetIndex, 10_000);
    const rows = [buildAuditRow(2, targetValues)];
    const probe = probeImportHistoryRepository();

    try {
      const resolved = await resolveImportHistoryForDuplicateDetection(org, buildAuditReview(rows));
      expect(probe.listCalls).toBe(1);
      expect(resolved.meta.source).toBe('fallback-incomplete');
      expect(resolved.importHistory.length).toBe(10_000);

      const duplicateResult = detectDuplicateImport({
        resolvedReview: buildAuditReview(rows),
        importHistory: resolved.importHistory,
      });
      expect(duplicateResult.status).not.toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);

      recordAuditRow({
        history: 10_000,
        excelRows: 10,
        mode: 'incomplete',
        indexReads: resolved.meta.indexLookupCount,
        historyReads: historyReadsFromProbe(probe),
        candidates: resolved.meta.candidateImportIds.length,
        timeMs: 0,
        listCalls: probe.listCalls,
        getByIdCalls: probe.getByIdCalls,
        historyDocsMaterialized: historyReadsFromProbe(probe),
        note: 'TEST E intentional fallback',
      });
    } finally {
      probe.restore();
    }
  }, 300_000);

  it('TEST F — index lookup failure falls back with correct duplicate decision', async () => {
    const org = orgId('index-failure');
    const targetIndex = 42;
    await seedBulkCompleteIndex(org, 500, { targetIndex });

    const targetValues = historyValues(targetIndex, 500);
    const rows = [buildAuditRow(2, targetValues)];

    const originalGetOrgCollection = baseRepository.getOrgCollection;
    vi.spyOn(baseRepository, 'getOrgCollection').mockImplementation((oid, collectionName) => {
      if (collectionName === 'importDuplicateInvoices' || collectionName === 'importDuplicateRows') {
        throw new Error('Simulated index lookup failure');
      }

      return originalGetOrgCollection(oid, collectionName);
    });

    const probe = probeImportHistoryRepository();

    try {
      const resolved = await resolveImportHistoryForDuplicateDetection(org, buildAuditReview(rows));
      expect(resolved.meta.source).toBe('fallback-error');
      expect(probe.listCalls).toBeGreaterThanOrEqual(1);

      const duplicateResult = detectDuplicateImport({
        resolvedReview: buildAuditReview(rows),
        importHistory: resolved.importHistory,
      });
      expect(duplicateResult.status).not.toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);
    } finally {
      probe.restore();
      vi.restoreAllMocks();
    }
  }, 120_000);

  it('TEST G — repair restores fast path after incomplete index', async () => {
    const org = orgId('repair-2k');
    const count = 2_000;
    const skipIds = new Set(['imp-0', 'imp-1', 'imp-2']);

    await seedBulkCompleteIndex(org, count, { skipIndexForImportIds: skipIds });
    await markOrgIndexCoverageIncompleteForTests(org, USER);

    const rows = buildExcelRows(10, 'REPAIR-NEW');
    const probeBefore = probeImportHistoryRepository();

    try {
      const before = await resolveImportHistoryForDuplicateDetection(org, buildAuditReview(rows));
      expect(before.meta.source).toBe('fallback-incomplete');
      expect(probeBefore.listCalls).toBe(1);
    } finally {
      probeBefore.restore();
    }

    await importIndexRepairService.repairOrganizationIndex(org, USER);

    const probeAfter = probeImportHistoryRepository();

    try {
      const after = await resolveImportHistoryForDuplicateDetection(org, buildAuditReview(rows));
      expect(after.meta.source).toBe('index-empty');
      expect(probeAfter.listCalls).toBe(0);
      expect(probeAfter.getByIdCalls).toBe(0);
    } finally {
      probeAfter.restore();
    }
  }, 300_000);
});

describe.skipIf(emulatorReady)('Level 1 — Firestore emulator unavailable', () => {
  it('does not claim emulator performance results without emulator', () => {
    expect(emulatorReady).toBe(false);
  });
});
