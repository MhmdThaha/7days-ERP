/**
 * Final Sales Import Firestore Emulator Audit — supplemental tests (TEST ONLY).
 *
 * Run on FRESH emulator (separate from heavy bulk seed runs):
 *   npx firebase emulators:exec --only firestore --project demo-bakeryos-final-sales-import-audit -- "npx vitest run src/lib/import/duplicate/sales-import-final-audit.emulator.test.ts"
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
  process.env.GCLOUD_PROJECT = 'demo-bakeryos-final-sales-import-audit';
  process.env.GOOGLE_CLOUD_PROJECT = 'demo-bakeryos-final-sales-import-audit';
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-bakeryos-final-sales-import-audit' });
  delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  delete process.env.FIREBASE_ADMIN_PROJECT_ID;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
});

vi.mock('@/lib/firebase/admin', async () => {
  const { getApps, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  function getEmulatorFirestore() {
    const existing = getApps().find((app) => app.name === 'final-audit-emulator');
    const app =
      existing ?? initializeApp({ projectId: 'demo-bakeryos-final-sales-import-audit' }, 'final-audit-emulator');

    return getFirestore(app);
  }

  return { getAdminFirestore: getEmulatorFirestore };
});

import {
  buildDuplicateImportFingerprints,
  detectDuplicateImport,
  DUPLICATE_IMPORT_STATUS,
  IMPORT_HISTORY_STATUS,
} from '@/lib/import/duplicate';
import { resolveImportHistoryForDuplicateDetection } from '@/lib/import/duplicate/import-duplicate-index-candidate.service';
import { ORG_IMPORT_INDEX_COVERAGE } from '@/lib/import/duplicate/import-index-health.types';
import {
  assertEmulatorTestEnvironment,
  buildAuditReview,
  buildAuditRow,
  buildExcelRows,
  emulatorIsReachable,
  probeImportHistoryRepository,
  recordAuditRow,
} from '@/lib/import/duplicate/sales-import-performance-audit.helpers';
import {
  markOrgIndexCoverageCompleteForTests,
  markOrgIndexCoverageIncompleteForTests,
} from '@/lib/import/duplicate/import-index-health.test-helpers';
import { DUPLICATE_METADATA_STORAGE } from '@/lib/import/duplicate/import-history-duplicate-metadata.types';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { importHistoryRepository } from '@/lib/repositories/import-history.repository';
import { importIndexHealthRepository } from '@/lib/repositories/import-index-health.repository';

const USER = 'final-audit-user';

function orgId(label: string) {
  return `org-final-${label}-${Math.random().toString(36).slice(2, 8)}`;
}

async function seedSmallInlineHistory(org: string, count: number) {
  for (let index = 0; index < count; index += 1) {
    const rows = buildExcelRows(1, `H${index}`);
    const fp = buildDuplicateImportFingerprints(rows);
    await importHistoryRepository.create(org, USER, {
      reportType: 'sales-detail',
      rowCount: 1,
      rowsImported: 1,
      rowsSkipped: 0,
      rowsFailed: 0,
      fileFingerprint: fp.fileFingerprint,
      invoiceNumbers: fp.invoiceNumbers,
      rowFingerprints: fp.rowFingerprints,
      saleIds: [],
      executionStatus: 'IMPORTED',
      lifecycleStatus: IMPORT_HISTORY_STATUS.COMPLETED,
    });
  }
}

async function writeChunkedImportViaRepository(org: string, rowCount: number) {
  const rows = buildExcelRows(rowCount, `CHK-${rowCount}`);
  const fp = buildDuplicateImportFingerprints(rows);
  const session = await importHistoryRepository.beginOrResume(org, USER, {
    reportType: 'sales-detail',
    rowCount,
    fileFingerprint: fp.fileFingerprint,
    invoiceNumbers: fp.invoiceNumbers,
    rowFingerprints: fp.rowFingerprints,
  });

  await importHistoryRepository.updateLifecycle(org, session.history.importId, USER, {
    status: IMPORT_HISTORY_STATUS.COMPLETED,
    rowsImported: rowCount,
  });

  return { importId: session.history.importId, fp, rows };
}

const emulatorReady = await emulatorIsReachable();

describe.skipIf(!emulatorReady)('Final Sales Import emulator audit — supplemental', () => {
  beforeAll(() => {
    assertEmulatorTestEnvironment();
  });

  it('chunked storage via production repository — 500 rows', async () => {
    const org = orgId('chunk-500');
    const { importId, fp } = await writeChunkedImportViaRepository(org, 500);
    const loaded = await importHistoryRepository.getById(org, importId);

    expect(loaded).not.toBeNull();
    expect(loaded!.duplicateMetadataStorage).toBe(DUPLICATE_METADATA_STORAGE.CHUNKED);
    expect(loaded!.duplicateMetadataComplete).toBe(true);
    expect(loaded!.rowFingerprints).toEqual(fp.rowFingerprints);
    expect(loaded!.invoiceNumbers).toEqual(fp.invoiceNumbers);

    const firestore = getAdminFirestore();
    const mainSnap = await firestore
      .collection('organizations')
      .doc(org)
      .collection('importHistory')
      .doc(importId)
      .get();
    const mainBytes = Buffer.byteLength(JSON.stringify(mainSnap.data()), 'utf8');
    expect(mainBytes).toBeLessThan(32_768);

    const chunksSnap = await firestore
      .collection('organizations')
      .doc(org)
      .collection('importHistory')
      .doc(importId)
      .collection('duplicateMetadata')
      .get();

    let largestChunk = 0;
    for (const doc of chunksSnap.docs) {
      largestChunk = Math.max(largestChunk, Buffer.byteLength(JSON.stringify(doc.data()), 'utf8'));
    }

    expect(chunksSnap.size).toBeGreaterThan(0);
    expect(largestChunk).toBeLessThan(1_048_576 * 0.75);

    recordAuditRow({
      history: rowCountLabel(500),
      excelRows: 500,
      mode: 'chunked-write',
      indexReads: 0,
      historyReads: 1,
      candidates: 0,
      timeMs: 0,
      note: `main=${mainBytes}B largestChunk=${largestChunk}B chunks=${chunksSnap.size}`,
    });
  }, 120_000);

  it('chunked storage — 5000 rows under Firestore size limit', async () => {
    const org = orgId('chunk-5k');
    const { importId, fp } = await writeChunkedImportViaRepository(org, 5_000);
    const loaded = await importHistoryRepository.getById(org, importId);

    expect(loaded).not.toBeNull();
    expect(loaded!.rowFingerprints.length).toBe(5_000);
    expect(loaded!.rowFingerprints).toEqual(fp.rowFingerprints);

    const firestore = getAdminFirestore();
    const chunksSnap = await firestore
      .collection('organizations')
      .doc(org)
      .collection('importHistory')
      .doc(importId)
      .collection('duplicateMetadata')
      .get();

    for (const doc of chunksSnap.docs) {
      expect(Buffer.byteLength(JSON.stringify(doc.data()), 'utf8')).toBeLessThan(1_048_576 * 0.75);
    }
  }, 300_000);

  it('incomplete fallback finds duplicate at LAST historical import', async () => {
    const org = orgId('last-dup');
    await seedSmallInlineHistory(org, 200);
    const lastRows = buildExcelRows(1, 'H199');
    const lastFp = buildDuplicateImportFingerprints(lastRows);
    await importHistoryRepository.create(org, USER, {
      reportType: 'sales-detail',
      rowCount: 1,
      rowsImported: 1,
      rowsSkipped: 0,
      rowsFailed: 0,
      fileFingerprint: lastFp.fileFingerprint,
      invoiceNumbers: lastFp.invoiceNumbers,
      rowFingerprints: lastFp.rowFingerprints,
      saleIds: [],
      executionStatus: 'IMPORTED',
      lifecycleStatus: IMPORT_HISTORY_STATUS.COMPLETED,
    });

    await markOrgIndexCoverageIncompleteForTests(org, USER);
    const probe = probeImportHistoryRepository();

    try {
      const resolved = await resolveImportHistoryForDuplicateDetection(org, buildAuditReview(lastRows));
      expect(resolved.meta.source).toBe('fallback-incomplete');
      expect(resolved.meta.indexLookupCount).toBe(0);
      expect(probe.listCalls).toBe(1);
      expect(resolved.importHistory.length).toBe(201);

      const result = detectDuplicateImport({
        resolvedReview: buildAuditReview(lastRows),
        importHistory: resolved.importHistory,
      });
      expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    } finally {
      probe.restore();
    }
  }, 180_000);

  it('unknown and repairing coverage use safe fallback', async () => {
    const org = orgId('coverage-states');
    await seedSmallInlineHistory(org, 5);

    for (const coverage of [
      ORG_IMPORT_INDEX_COVERAGE.UNKNOWN,
      ORG_IMPORT_INDEX_COVERAGE.REPAIRING,
    ] as const) {
      await importIndexHealthRepository.setOrgCoverage(org, USER, { coverage });
      const resolved = await resolveImportHistoryForDuplicateDetection(org, buildAuditReview(buildExcelRows(3)));
      expect(resolved.meta.indexLookupCount).toBe(0);
      expect(resolved.meta.source).toMatch(/^fallback-/);
      expect(resolved.importHistory.length).toBe(5);
    }
  }, 120_000);

  it('missing chunk forces incomplete metadata on read', async () => {
    const org = orgId('missing-chunk');
    const { importId } = await writeChunkedImportViaRepository(org, 600);
    const firestore = getAdminFirestore();
    await firestore
      .collection('organizations')
      .doc(org)
      .collection('importHistory')
      .doc(importId)
      .collection('duplicateMetadata')
      .doc('row-0000')
      .delete();

    const loaded = await importHistoryRepository.getById(org, importId);
    expect(loaded!.duplicateMetadataComplete).toBe(false);
    expect(loaded!.rowFingerprints).toEqual([]);
  }, 120_000);

  it('forceNewSession creates separate import without touching primary lock', async () => {
    const org = orgId('exact-file');
    const rows = buildExcelRows(10, 'FILE-A');
    const fp = buildDuplicateImportFingerprints(rows);

    const first = await importHistoryRepository.beginOrResume(org, USER, {
      reportType: 'sales-detail',
      rowCount: 10,
      fileFingerprint: fp.fileFingerprint,
      invoiceNumbers: fp.invoiceNumbers,
      rowFingerprints: fp.rowFingerprints,
    });
    await importHistoryRepository.updateLifecycle(org, first.history.importId, USER, {
      status: IMPORT_HISTORY_STATUS.COMPLETED,
      rowsImported: 10,
    });

    const forced = await importHistoryRepository.beginOrResume(org, USER, {
      reportType: 'sales-detail',
      rowCount: 10,
      fileFingerprint: fp.fileFingerprint,
      invoiceNumbers: fp.invoiceNumbers,
      rowFingerprints: fp.rowFingerprints,
      forceNewSession: true,
    });

    expect(forced.history.importId).not.toBe(first.history.importId);
    expect(forced.resumed).toBe(false);

    const original = await importHistoryRepository.getById(org, first.history.importId);
    expect(original!.status).toBe(IMPORT_HISTORY_STATUS.COMPLETED);
  }, 120_000);
});

describe.skipIf(emulatorReady)('Final Sales Import emulator audit — unavailable', () => {
  it('does not claim emulator results without emulator', () => {
    expect(emulatorReady).toBe(false);
  });
});

function rowCountLabel(count: number): number {
  return count;
}
