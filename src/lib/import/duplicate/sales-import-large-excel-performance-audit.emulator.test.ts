/**
 * Large Sales Import Excel performance audit — Firestore Emulator (TEST ONLY).
 *
 * Run (fresh emulator per batch):
 *   npx firebase emulators:exec --only firestore --project demo-bakeryos-large-import-performance -- "npx vitest run src/lib/import/duplicate/sales-import-large-excel-performance-audit.emulator.test.ts -t \"Stage timing\""
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
  process.env.GCLOUD_PROJECT = 'demo-bakeryos-large-import-performance';
  process.env.GOOGLE_CLOUD_PROJECT = 'demo-bakeryos-large-import-performance';
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-bakeryos-large-import-performance' });
  delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  delete process.env.FIREBASE_ADMIN_PROJECT_ID;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
});

vi.mock('@/lib/firebase/admin', async () => {
  const { getApps, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  function getEmulatorFirestore() {
    const existing = getApps().find((app) => app.name === 'large-excel-audit');
    const app =
      existing ??
      initializeApp({ projectId: 'demo-bakeryos-large-import-performance' }, 'large-excel-audit');

    return getFirestore(app);
  }

  return { getAdminFirestore: getEmulatorFirestore };
});

import { Timestamp, type Firestore, type WriteBatch } from 'firebase-admin/firestore';

import { DUPLICATE_IMPORT_STATUS, IMPORT_HISTORY_STATUS } from '@/lib/import/duplicate';
import { DUPLICATE_METADATA_STORAGE } from '@/lib/import/duplicate/import-history-duplicate-metadata.types';
import {
  assertEmulatorTestEnvironment,
  buildResolvedReviewFromXlsx,
  buildSalesDetailXlsx,
  detectDuplicateImportForLargeExcelAudit,
  emptyLargeExcelTimings,
  emulatorIsReachable,
  expectedIndexQueries,
  historyReadsFromProbe,
  LARGE_EXCEL_PERF_ROWS,
  measureIndexLookup,
  parserRowLimit,
  probeImportHistoryRepository,
  recordLargeExcelRow,
  runFingerprintStage,
  runParseStage,
  runReviewStage,
} from '@/lib/import/duplicate/sales-import-performance-audit.helpers';
import { resolveImportHistoryForDuplicateDetection } from '@/lib/import/duplicate/import-duplicate-index-candidate.service';
import {
  markOrgIndexCoverageCompleteForTests,
  markOrgIndexCoverageIncompleteForTests,
} from '@/lib/import/duplicate/import-index-health.test-helpers';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { prepareImportFile } from '@/lib/import/services/import.service';
import { hashImportIdentity, importHistoryRepository } from '@/lib/repositories/import-history.repository';

const USER = 'large-excel-audit-user';
const BATCH_LIMIT = 450;

function orgId(label: string) {
  return `org-lg-${label}-${Math.random().toString(36).slice(2, 8)}`;
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
  return { batch: firestore.batch(), opsInBatch: 0 };
}

async function seedLightCompleteIndex(org: string, count: number): Promise<void> {
  const firestore = getAdminFirestore();
  let batch = firestore.batch();
  let opsInBatch = 0;
  const now = Timestamp.now();

  for (let index = 0; index < count; index += 1) {
    const importId = `imp-${index}`;
    const invoice = `HIST-${index}`;
    const rowFp = JSON.stringify(['2026-08-01', `C${index}`, 'Bread', '1', '1', invoice]);
    const invoiceHash = hashImportIdentity(invoice.trim().toUpperCase());
    const rowHash = hashImportIdentity(rowFp);

    batch.set(
      firestore.collection('organizations').doc(org).collection('importHistory').doc(importId),
      {
        organizationId: org,
        reportType: 'sales-detail',
        rowCount: 1,
        rowsImported: 1,
        rowsSkipped: 0,
        rowsFailed: 0,
        fileFingerprint: `file-${index}`,
        invoiceNumbers: [invoice],
        rowFingerprints: [rowFp],
        saleIds: [],
        executionStatus: 'IMPORTED',
        status: IMPORT_HISTORY_STATUS.COMPLETED,
        duplicateIndexStatus: 'complete',
        createdAt: now,
        createdBy: USER,
        updatedAt: now,
        updatedBy: USER,
        deletedAt: null,
        deletedBy: null,
      },
    );
    opsInBatch += 1;

    batch.set(
      firestore
        .collection('organizations')
        .doc(org)
        .collection('importDuplicateInvoices')
        .doc(invoiceHash)
        .collection('hits')
        .doc(importId),
      {
        organizationId: org,
        importId,
        invoiceNormalized: invoice,
        invoiceHash,
        status: IMPORT_HISTORY_STATUS.COMPLETED,
        indexedAt: now,
        createdBy: USER,
      },
    );
    opsInBatch += 1;

    batch.set(
      firestore
        .collection('organizations')
        .doc(org)
        .collection('importDuplicateRows')
        .doc(rowHash)
        .collection('hits')
        .doc(importId),
      {
        organizationId: org,
        importId,
        fingerprintHash: rowHash,
        status: IMPORT_HISTORY_STATUS.COMPLETED,
        indexedAt: now,
        createdBy: USER,
      },
    );
    opsInBatch += 1;

    if (opsInBatch >= BATCH_LIMIT) {
      ({ batch, opsInBatch } = await flushBatch(firestore, batch, opsInBatch));
    }
  }

  await flushBatch(firestore, batch, opsInBatch);
  await markOrgIndexCoverageCompleteForTests(org, USER, count);
}

async function measureChunkWrite(org: string, rowCount: number) {
  const review = await buildResolvedReviewFromXlsx(rowCount);
  const fp = runFingerprintStage(rowCount).fingerprints;
  const started = performance.now();
  const session = await importHistoryRepository.beginOrResume(org, USER, {
    reportType: 'sales-detail',
    rowCount,
    fileFingerprint: fp.fileFingerprint,
    invoiceNumbers: fp.invoiceNumbers,
    rowFingerprints: fp.rowFingerprints,
  });
  const chunkWriteMs = Math.round(performance.now() - started);

  const firestore = getAdminFirestore();
  const mainSnap = await firestore
    .collection('organizations')
    .doc(org)
    .collection('importHistory')
    .doc(session.history.importId)
    .get();
  const mainDocBytes = Buffer.byteLength(JSON.stringify(mainSnap.data()), 'utf8');

  const chunksSnap = await firestore
    .collection('organizations')
    .doc(org)
    .collection('importHistory')
    .doc(session.history.importId)
    .collection('duplicateMetadata')
    .get();

  let largestChunkBytes = 0;
  for (const doc of chunksSnap.docs) {
    largestChunkBytes = Math.max(largestChunkBytes, Buffer.byteLength(JSON.stringify(doc.data()), 'utf8'));
  }

  return {
    chunkWriteMs,
    mainDocBytes,
    chunkCount: chunksSnap.size,
    largestChunkBytes,
    storage: session.history.duplicateMetadataStorage,
    complete: session.history.duplicateMetadataComplete,
  };
}

const emulatorReady = await emulatorIsReachable();

describe.skipIf(!emulatorReady)('Large Excel performance audit — emulator', () => {
  beforeAll(() => {
    assertEmulatorTestEnvironment();
    LARGE_EXCEL_PERF_ROWS.length = 0;
  });

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.info('\n[Large Excel performance rows]', JSON.stringify(LARGE_EXCEL_PERF_ROWS));
    // eslint-disable-next-line no-console
    console.info('[Parser row limit]', parserRowLimit());
    // eslint-disable-next-line no-console
    console.info('[Production Firebase writes]', 0);

    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const outPath = path.join(process.cwd(), 'large-excel-perf-results.json');
    let existing: { rows: typeof LARGE_EXCEL_PERF_ROWS } = { rows: [] };
    if (fs.existsSync(outPath)) {
      existing = JSON.parse(fs.readFileSync(outPath, 'utf8')) as { rows: typeof LARGE_EXCEL_PERF_ROWS };
    }
    const merged = [...existing.rows, ...LARGE_EXCEL_PERF_ROWS];
    fs.writeFileSync(
      outPath,
      JSON.stringify({ rows: merged, parserLimit: parserRowLimit(), updatedAt: new Date().toISOString() }, null, 2),
    );
  });

  describe('Stage timing — local pipeline (no history)', () => {
    for (const rowCount of [10, 100, 500, 1_000, 2_500, 5_000, 10_000] as const) {
      it(`parse + review + fingerprint for ${rowCount} rows`, () => {
        const heapBefore = process.memoryUsage().heapUsed;
        const parse = runParseStage(rowCount);
        const review = runReviewStage(rowCount);
        const fingerprint = runFingerprintStage(rowCount);
        const heapAfter = process.memoryUsage().heapUsed;

        expect(parse.parsedRowCount).toBe(rowCount);
        expect(review.resolvedRowCount).toBe(rowCount);

        recordLargeExcelRow({
          excelRows: rowCount,
          historyImports: 0,
          indexState: 'complete',
          uniqueInvoices: fingerprint.fingerprints.invoiceNumbers.length,
          uniqueRowFingerprints: fingerprint.fingerprints.rowFingerprints.length,
          indexQueryCount: 0,
          expectedIndexQueries: expectedIndexQueries(fingerprint.fingerprints),
          historyDocsRead: 0,
          candidateCount: 0,
          heapDeltaMb: Math.round(((heapAfter - heapBefore) / 1024 / 1024) * 10) / 10,
          mainDocBytes: 0,
          chunkCount: 0,
          largestChunkBytes: 0,
          duplicateStatus: 'N/A',
          timings: {
            ...emptyLargeExcelTimings(),
            parseMs: parse.parseMs,
            reviewMs: review.reviewMs,
            fingerprintMs: fingerprint.fingerprintMs,
            totalMs: parse.parseMs + review.reviewMs + fingerprint.fingerprintMs,
          },
          note: 'stage-only no-firestore',
        });
      }, rowCount >= 5_000 ? 120_000 : 60_000);
    }

    it('parser rejects rows above DEFAULT_MAX_DATA_ROWS', () => {
      expect(parserRowLimit()).toBe(10_000);
      const bytes = buildSalesDetailXlsx(10_001);
      expect(() =>
        prepareImportFile(bytes, 'sale', { fileName: 'large-sales.xlsx' }),
      ).toThrow();
    });
  });

  describe('Complete index — index lookup scales with Excel size', () => {
    const HISTORY = 1_000;

    beforeAll(async () => {
      await seedLightCompleteIndex(orgId('seed-complete-1k'), HISTORY);
    }, 180_000);

    for (const rowCount of [10, 100, 500, 1_000, 2_500, 5_000] as const) {
      it(`${rowCount} Excel rows / ${HISTORY} history / complete index`, async () => {
        const org = orgId(`idx-${rowCount}`);
        await seedLightCompleteIndex(org, HISTORY);

        const fingerprint = runFingerprintStage(rowCount);
        const index = await measureIndexLookup(org, fingerprint.fingerprints);
        const expected = expectedIndexQueries(fingerprint.fingerprints);

        expect(index.indexQueryCount).toBe(expected);

        const probe = probeImportHistoryRepository();
        try {
          const review = await buildResolvedReviewFromXlsx(rowCount);
          const resolveStarted = performance.now();
          const resolved = await resolveImportHistoryForDuplicateDetection(org, review);
          const resolveHistoryMs = Math.round(performance.now() - resolveStarted);

          expect(probe.listCalls).toBe(0);
          expect(resolved.meta.indexLookupCount).toBe(expected);

          const duplicateResult = detectDuplicateImportForLargeExcelAudit({
            resolvedReview: review,
            importHistory: resolved.importHistory,
          });
          expect(duplicateResult.status).toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);

          recordLargeExcelRow({
            excelRows: rowCount,
            historyImports: HISTORY,
            indexState: 'complete',
            uniqueInvoices: new Set(fingerprint.fingerprints.invoiceNumbers).size,
            uniqueRowFingerprints: fingerprint.fingerprints.rowFingerprints.length,
            indexQueryCount: index.indexQueryCount,
            expectedIndexQueries: expected,
            historyDocsRead: historyReadsFromProbe(probe),
            candidateCount: index.candidateCount,
            heapDeltaMb: 0,
            mainDocBytes: 0,
            chunkCount: 0,
            largestChunkBytes: 0,
            duplicateStatus: duplicateResult.status,
            timings: {
              ...emptyLargeExcelTimings(),
              fingerprintMs: fingerprint.fingerprintMs,
              indexLookupMs: index.indexLookupMs,
              resolveHistoryMs,
              totalMs: index.indexLookupMs + resolveHistoryMs,
            },
            note: 'emulator complete index',
          });
        } finally {
          probe.restore();
        }
      }, rowCount >= 2_500 ? 300_000 : 120_000);
    }
  });

  describe('Incomplete index — safe fallback with large Excel', () => {
    it('1000 Excel rows / 1000 history / incomplete', async () => {
      const org = orgId('incomplete-1k');
      await seedLightCompleteIndex(org, 1_000);
      await markOrgIndexCoverageIncompleteForTests(org, USER);

      const review = await buildResolvedReviewFromXlsx(1_000);
      const probe = probeImportHistoryRepository();

      try {
        const started = performance.now();
        const resolved = await resolveImportHistoryForDuplicateDetection(org, review);
        const elapsed = Math.round(performance.now() - started);

        expect(resolved.meta.indexLookupCount).toBe(0);
        expect(probe.listCalls).toBe(1);
        expect(resolved.importHistory.length).toBe(1_000);

        const duplicateResult = detectDuplicateImportForLargeExcelAudit({
          resolvedReview: review,
          importHistory: resolved.importHistory,
        });
        expect(duplicateResult.status).toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);

        recordLargeExcelRow({
          excelRows: 1_000,
          historyImports: 1_000,
          indexState: 'incomplete',
          uniqueInvoices: 1_000,
          uniqueRowFingerprints: 1_000,
          indexQueryCount: 0,
          expectedIndexQueries: 68,
          historyDocsRead: historyReadsFromProbe(probe),
          candidateCount: 0,
          heapDeltaMb: 0,
          mainDocBytes: 0,
          chunkCount: 0,
          largestChunkBytes: 0,
          duplicateStatus: duplicateResult.status,
          timings: {
            ...emptyLargeExcelTimings(),
            resolveHistoryMs: elapsed,
            totalMs: elapsed,
          },
          note: 'emulator incomplete fallback',
        });
      } finally {
        probe.restore();
      }
    }, 300_000);
  });

  describe('Chunk storage — production beginOrResume', () => {
    for (const rowCount of [500, 1_000, 2_500, 5_000, 10_000] as const) {
      it(`chunk write for ${rowCount} rows`, async () => {
        const org = orgId(`chunk-${rowCount}`);
        const result = await measureChunkWrite(org, rowCount);

        expect(result.complete).toBe(true);
        expect(result.mainDocBytes).toBeLessThan(32_768);

        if (rowCount >= 500) {
          expect(result.storage).toBe(DUPLICATE_METADATA_STORAGE.CHUNKED);
          expect(result.chunkCount).toBeGreaterThan(0);
        }

        expect(result.largestChunkBytes).toBeLessThan(1_048_576 * 0.75);

        recordLargeExcelRow({
          excelRows: rowCount,
          historyImports: 0,
          indexState: 'complete',
          uniqueInvoices: rowCount,
          uniqueRowFingerprints: rowCount,
          indexQueryCount: 0,
          expectedIndexQueries: 0,
          historyDocsRead: 0,
          candidateCount: 0,
          heapDeltaMb: 0,
          mainDocBytes: result.mainDocBytes,
          chunkCount: result.chunkCount,
          largestChunkBytes: result.largestChunkBytes,
          duplicateStatus: 'N/A',
          timings: {
            ...emptyLargeExcelTimings(),
            chunkWriteMs: result.chunkWriteMs,
            totalMs: result.chunkWriteMs,
          },
          note: 'emulator chunk write',
        });
      }, rowCount >= 5_000 ? 600_000 : 180_000);
    }
  });
});

describe.skipIf(emulatorReady)('Large Excel performance audit — emulator unavailable', () => {
  it('does not claim large Excel emulator results without emulator', () => {
    expect(emulatorReady).toBe(false);
  });
});
