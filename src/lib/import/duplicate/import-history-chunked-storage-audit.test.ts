/**
 * Chunked importHistory — hardcore audit (TEST ONLY, in-memory Firestore mock).
 *
 * Run: npx vitest run src/lib/import/duplicate/import-history-chunked-storage-audit.test.ts
 */

import { Timestamp } from 'firebase-admin/firestore';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildDuplicateImportFingerprints,
  detectDuplicateImport,
  DUPLICATE_IMPORT_STATUS,
  IMPORT_HISTORY_STATUS,
} from '@/lib/import/duplicate';
import { resolveImportHistoryForDuplicateDetection } from '@/lib/import/duplicate/import-duplicate-index-candidate.service';
import { withCollectionGroupMock } from '@/lib/import/duplicate/import-duplicate-index-collection-group.mock';
import { DUPLICATE_METADATA_STORAGE } from '@/lib/import/duplicate/import-history-duplicate-metadata.types';
import {
  AUDIT_CHUNK_MAX_BYTES,
  AUDIT_MAIN_DOC_MAX_BYTES,
  AUDIT_STORAGE_RESULTS,
  buildAuditRow,
  buildAuditRows,
  DUPLICATE_METADATA_CHUNK_THRESHOLD_ROWS,
  expectedTotalChunks,
  fileFingerprintsMatch,
  inlineLogicalRecord,
  legacyInlineDocument,
  measureStoredImport,
  recordStorageAudit,
  type DocMap,
} from '@/lib/import/duplicate/import-history-chunked-storage-audit.helpers';
import { finalizeIndexedHistoryForTests, markOrgIndexCoverageCompleteForTests } from '@/lib/import/duplicate/import-index-health.test-helpers';
import type { ImportReviewViewModelWithResolution } from '@/lib/import/resolution/types';
import { importHistoryDuplicateMetadataRepository } from '@/lib/repositories/import-history-duplicate-metadata.repository';
import { hashImportIdentity, importHistoryRepository } from '@/lib/repositories/import-history.repository';

function createAuditFirestore(options?: { failBatchCommitAfter?: number }) {
  const docs: DocMap = new Map();
  let autoId = 0;
  let batchCommits = 0;

  function collectionAt(basePath: string) {
    return {
      doc(id?: string) {
        const docId = id ?? `auto-${++autoId}`;
        const path = `${basePath}/${docId}`;
        return {
          id: docId,
          path,
          collection(name: string) {
            return collectionAt(`${path}/${name}`);
          },
          get: async () => ({ exists: docs.has(path), id: docId, data: () => docs.get(path) }),
          set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
            const prev = docs.get(path);
            docs.set(path, opts?.merge && prev ? { ...prev, ...data } : { ...data });
          },
          update: async (data: Record<string, unknown>) => {
            docs.set(path, { ...(docs.get(path) ?? {}), ...data });
          },
        };
      },
      where(field: string, op: string, value: unknown) {
        const filters = [{ field, op, value }];
        const query = {
          where(nf: string, nop: string, nv: unknown) {
            filters.push({ field: nf, op: nop, value: nv });
            return query;
          },
          limit() {
            return query;
          },
          get: async () => {
            const matches = [...docs.entries()].filter(([path, data]) => {
              const suffix = path.slice(basePath.length + 1);
              if (!path.startsWith(`${basePath}/`) || suffix.includes('/')) return false;
              return filters.every((f) => f.op === '==' && data[f.field] === f.value);
            });
            return {
              docs: matches.map(([path, data]) => ({ id: path.slice(basePath.length + 1), data: () => data })),
              empty: matches.length === 0,
            };
          },
        };
        return query;
      },
      get: async () => ({
        docs: [...docs.entries()]
          .filter(([path]) => {
            const suffix = path.slice(basePath.length + 1);
            return path.startsWith(`${basePath}/`) && !suffix.includes('/');
          })
          .map(([path, data]) => ({ id: path.slice(basePath.length + 1), data: () => data })),
      }),
    };
  }

  const db = withCollectionGroupMock(
    {
    collection: (name: string) => {
      const root = collectionAt(name);
      return {
        ...root,
        doc(id?: string) {
          const ref = root.doc(id);
          return { ...ref, collection: (sub: string) => collectionAt(`${ref.path}/${sub}`) };
        },
      };
    },
    batch: () => {
      const ops: Array<{ path: string; data: Record<string, unknown> }> = [];
      const batchIndex = batchCommits;
      return {
        set(ref: { path: string }, data: Record<string, unknown>) {
          ops.push({ path: ref.path, data: { ...data } });
        },
        async commit() {
          if (options?.failBatchCommitAfter !== undefined && batchIndex >= options.failBatchCommitAfter) {
            throw new Error('Simulated chunk batch commit failure');
          }
          batchCommits += 1;
          for (const op of ops) docs.set(op.path, op.data);
        },
      };
    },
    runTransaction: async (fn: (tx: { get: (ref: { path: string }) => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>; set: (ref: { path: string }, data: Record<string, unknown>) => void }) => Promise<unknown>) =>
      fn({
        get: async (ref) => ({ exists: docs.has(ref.path), data: () => docs.get(ref.path) }),
        set: (ref, data) => docs.set(ref.path, { ...data }),
      }),
  },
    docs,
  );

  return { docs, db, batchCommits: () => batchCommits };
}

const harness = vi.hoisted(() => ({
  current: null as ReturnType<typeof createAuditFirestore> | null,
}));

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => harness.current!.db,
}));

const ORG = 'org-audit';
const USER = 'audit-user';

async function beginImport(rows: ReturnType<typeof buildAuditRows>) {
  const fp = buildDuplicateImportFingerprints(rows);
  const started = performance.now();
  const session = await importHistoryRepository.beginOrResume(ORG, USER, {
    reportType: 'sales-detail',
    rowCount: rows.length,
    fileFingerprint: fp.fileFingerprint,
    invoiceNumbers: fp.invoiceNumbers,
    rowFingerprints: fp.rowFingerprints,
  });
  return { session, fp, elapsedMs: performance.now() - started };
}

describe('Chunked importHistory hardcore audit', () => {
  beforeEach(() => {
    harness.current = createAuditFirestore();
    AUDIT_STORAGE_RESULTS.length = 0;
  });

  describe('Phase 2/3 — large import storage matrix', () => {
    for (const rowCount of [100, 499, 500, 501, 1_000, 5_000, 10_000, 20_000] as const) {
      it(`storage correctness for ${rowCount} rows`, async () => {
        const rows = buildAuditRows(rowCount);
        const { session, fp, elapsedMs } = await beginImport(rows);
        const loaded = await importHistoryRepository.getById(ORG, session.history.importId)!;
        const measured = measureStoredImport(harness.current!.docs, ORG, session.history.importId, fp);

        expect(loaded.invoiceNumbers).toEqual(fp.invoiceNumbers);
        expect(loaded.rowFingerprints).toEqual(fp.rowFingerprints);
        expect(fileFingerprintsMatch(fp.fileFingerprint, fp.rowFingerprints, loaded.fileFingerprint)).toBe(true);
        expect(loaded.duplicateMetadataComplete).toBe(true);

        if (rowCount >= DUPLICATE_METADATA_CHUNK_THRESHOLD_ROWS) {
          expect(measured.storage).toBe(DUPLICATE_METADATA_STORAGE.CHUNKED);
          expect(measured.mainDocBytes).toBeLessThan(AUDIT_MAIN_DOC_MAX_BYTES);
          expect(measured.largestChunkBytes).toBeLessThan(AUDIT_CHUNK_MAX_BYTES);
          expect(measured.chunkCount).toBe(expectedTotalChunks(fp.rowFingerprints.length, fp.invoiceNumbers.length));
        } else {
          expect(measured.storage).toBe(DUPLICATE_METADATA_STORAGE.INLINE);
          expect(measured.chunkCount).toBe(0);
        }

        recordStorageAudit(rowCount, { ...measured, fileFingerprintMatch: true }, Math.round(elapsedMs));
      });
    }
  });

  describe('Phase 4 — threshold edge cases 499/500/501', () => {
    for (const rowCount of [499, 500, 501] as const) {
      it(`${rowCount} rows inline vs chunked logical parity`, async () => {
        const rows = buildAuditRows(rowCount);
        const fp = buildDuplicateImportFingerprints(rows);
        const review = { rows } as ImportReviewViewModelWithResolution;
        const inline = inlineLogicalRecord('inline-ref', USER, fp);

        const { session } = await beginImport(rows);
        const chunked = (await importHistoryRepository.getById(ORG, session.history.importId))!;

        expect(new Set(chunked.invoiceNumbers)).toEqual(new Set(inline.invoiceNumbers));
        expect(new Set(chunked.rowFingerprints)).toEqual(new Set(inline.rowFingerprints));
        expect(chunked.fileFingerprint).toBe(inline.fileFingerprint);

        const inlineResult = detectDuplicateImport({ resolvedReview: review, importHistory: [inline] });
        const chunkedResult = detectDuplicateImport({ resolvedReview: review, importHistory: [chunked] });
        expect(chunkedResult.status).toBe(inlineResult.status);
        expect(chunkedResult.matchedRows).toBe(inlineResult.matchedRows);
      });
    }
  });

  describe('Phase 5 — duplicate detection scenarios', () => {
    it('brand-new import against empty history', async () => {
      const rows = buildAuditRows(10);
      const review = { rows } as ImportReviewViewModelWithResolution;
      const result = detectDuplicateImport({ resolvedReview: review, importHistory: [] });
      expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.NO_DUPLICATE);
    });

    it('exact duplicate against chunked historical import', async () => {
      const rows = buildAuditRows(600);
      const fp = buildDuplicateImportFingerprints(rows);
      const review = { rows } as ImportReviewViewModelWithResolution;
      await beginImport(rows);
      const history = await importHistoryRepository.list(ORG);
      const result = detectDuplicateImport({ resolvedReview: review, importHistory: history });
      expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    });

    it('duplicate against legacy inline historical import', async () => {
      const rows = buildAuditRows(50);
      const fp = buildDuplicateImportFingerprints(rows);
      const review = { rows } as ImportReviewViewModelWithResolution;
      harness.current!.docs.set(
        `organizations/${ORG}/importHistory/legacy-1`,
        legacyInlineDocument(ORG, 'legacy-1', USER, fp, rows.length),
      );
      const history = await importHistoryRepository.list(ORG);
      const result = detectDuplicateImport({ resolvedReview: review, importHistory: history });
      expect(result.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    });

    it('same invoice different row content — not exact duplicate', async () => {
      const histRows = [buildAuditRow(2, { invoice: 'INV-SAME', productName: 'Bread A' })];
      const newRows = [buildAuditRow(3, { invoice: 'INV-SAME', productName: 'Bread B' })];
      const histFp = buildDuplicateImportFingerprints(histRows);
      harness.current!.docs.set(
        `organizations/${ORG}/importHistory/hist-inv`,
        legacyInlineDocument(ORG, 'hist-inv', USER, histFp, 1),
      );
      const result = detectDuplicateImport({
        resolvedReview: { rows: newRows } as ImportReviewViewModelWithResolution,
        importHistory: await importHistoryRepository.list(ORG),
      });
      expect(result.status).not.toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
    });
  });

  describe('Phase 6 — exact-file re-import', () => {
    it('forced re-import creates separate chunked import without mutating original', async () => {
      const rows = buildAuditRows(600);
      const fp = buildDuplicateImportFingerprints(rows);
      const original = await beginImport(rows);
      await importHistoryRepository.updateLifecycle(ORG, original.session.history.importId, USER, {
        status: IMPORT_HISTORY_STATUS.COMPLETED,
      });

      const originalPath = `organizations/${ORG}/importHistory/${original.session.history.importId}`;
      const originalChunksBefore = [...harness.current!.docs.keys()].filter((p) =>
        p.startsWith(`${originalPath}/duplicateMetadata/`),
      ).length;

      const forced = await importHistoryRepository.beginOrResume(ORG, USER, {
        reportType: 'sales-detail',
        rowCount: rows.length,
        fileFingerprint: fp.fileFingerprint,
        invoiceNumbers: fp.invoiceNumbers,
        rowFingerprints: fp.rowFingerprints,
        forceNewSession: true,
      });

      expect(forced.resumed).toBe(false);
      expect(forced.history.importId).not.toBe(original.session.history.importId);

      const originalChunksAfter = [...harness.current!.docs.keys()].filter((p) =>
        p.startsWith(`${originalPath}/duplicateMetadata/`),
      ).length;
      expect(originalChunksAfter).toBe(originalChunksBefore);

      const lockHash = hashImportIdentity(fp.fileFingerprint);
      const primaryLock = harness.current!.docs.get(`organizations/${ORG}/importFileLocks/${lockHash}`);
      expect(primaryLock?.importId).toBe(original.session.history.importId);
    });
  });

  describe('Phase 7 — partial chunk failure', () => {
    async function seedCompleteChunkedImport(rowCount: number) {
      const rows = buildAuditRows(rowCount);
      const { session, fp } = await beginImport(rows);
      return { session, fp, mainPath: `organizations/${ORG}/importHistory/${session.history.importId}` };
    }

    for (const [label, deleteChunk] of [
      ['first row chunk missing', 'row-0000'],
      ['middle row chunk missing', 'row-0001'],
      ['last row chunk missing', null as string | null],
      ['first invoice chunk missing', 'inv-0000'],
    ] as const) {
      it(`detects unsafe state when ${label}`, async () => {
        const { session, mainPath } = await seedCompleteChunkedImport(2_500);
        harness.current!.docs.set(mainPath, {
          ...harness.current!.docs.get(mainPath)!,
          duplicateMetadataComplete: false,
        });

        const chunkToDelete =
          deleteChunk ??
          `row-${String(importHistoryDuplicateMetadataRepository.expectedRowChunkCount(2500) - 1).padStart(4, '0')}`;
        harness.current!.docs.delete(`${mainPath}/duplicateMetadata/${chunkToDelete}`);

        const loaded = await importHistoryRepository.getById(ORG, session.history.importId);
        expect(loaded?.duplicateMetadataComplete).toBe(false);
        expect(loaded?.rowFingerprints).toEqual([]);
        expect(await importHistoryRepository.hasIncompleteDuplicateMetadata(ORG)).toBe(true);
      });
    }

    it('incomplete metadata forces fallback not fast index path', async () => {
      const rows = buildAuditRows(600);
      const review = { rows: buildAuditRows(5) } as ImportReviewViewModelWithResolution;
      const { session } = await beginImport(rows);
      const mainPath = `organizations/${ORG}/importHistory/${session.history.importId}`;
      harness.current!.docs.set(mainPath, {
        ...harness.current!.docs.get(mainPath)!,
        duplicateMetadataComplete: false,
      });

      await markOrgIndexCoverageCompleteForTests(ORG, USER, 1);
      const resolved = await resolveImportHistoryForDuplicateDetection(ORG, review);
      expect(resolved.meta.source).not.toBe('index');
    });
  });

  describe('Phase 8 — write failure simulation', () => {
    it('chunk batch failure leaves duplicateMetadataComplete false', async () => {
      harness.current = createAuditFirestore({ failBatchCommitAfter: 0 });
      const rows = buildAuditRows(600);
      const fp = buildDuplicateImportFingerprints(rows);

      await expect(
        importHistoryRepository.beginOrResume(ORG, USER, {
          reportType: 'sales-detail',
          rowCount: rows.length,
          fileFingerprint: fp.fileFingerprint,
          invoiceNumbers: fp.invoiceNumbers,
          rowFingerprints: fp.rowFingerprints,
        }),
      ).rejects.toThrow('Simulated chunk batch commit failure');

      const incomplete = [...harness.current.docs.values()].find(
        (doc) => doc.duplicateMetadataComplete === false,
      );
      expect(incomplete).toBeDefined();
    });
  });

  describe('Phase 9 — crash recovery resume', () => {
    it('resume rewrites incomplete chunks from input fingerprints', async () => {
      const rows = buildAuditRows(600);
      const fp = buildDuplicateImportFingerprints(rows);
      const first = await beginImport(rows);
      const mainPath = `organizations/${ORG}/importHistory/${first.session.history.importId}`;

      harness.current!.docs.set(mainPath, {
        ...harness.current!.docs.get(mainPath)!,
        duplicateMetadataComplete: false,
      });
      for (const path of [...harness.current!.docs.keys()].filter((p) => p.includes('/duplicateMetadata/'))) {
        harness.current!.docs.delete(path);
      }

      const resumed = await importHistoryRepository.beginOrResume(ORG, USER, {
        reportType: 'sales-detail',
        rowCount: rows.length,
        fileFingerprint: fp.fileFingerprint,
        invoiceNumbers: fp.invoiceNumbers,
        rowFingerprints: fp.rowFingerprints,
        resumeImportId: first.session.history.importId,
      });

      expect(resumed.resumed).toBe(true);
      const loaded = await importHistoryRepository.getById(ORG, first.session.history.importId);
      expect(loaded?.duplicateMetadataComplete).toBe(true);
      expect(loaded?.rowFingerprints).toEqual(fp.rowFingerprints);
    });
  });

  describe('Phase 10 — concurrency', () => {
    it('sequential same-file beginOrResume resumes existing importId', async () => {
      const rows = buildAuditRows(600);
      const fp = buildDuplicateImportFingerprints(rows);
      const input = {
        reportType: 'sales-detail',
        rowCount: rows.length,
        fileFingerprint: fp.fileFingerprint,
        invoiceNumbers: fp.invoiceNumbers,
        rowFingerprints: fp.rowFingerprints,
      };

      const first = await importHistoryRepository.beginOrResume(ORG, 'worker-a', input);
      const second = await importHistoryRepository.beginOrResume(ORG, 'worker-b', input);

      expect(second.resumed).toBe(true);
      expect(second.history.importId).toBe(first.history.importId);
    });
  });

  describe('Phase 11 — legacy + chunked coexistence', () => {
    it('list returns both legacy inline and chunked imports with full metadata', async () => {
      const legacyRows = buildAuditRows(50);
      const legacyFp = buildDuplicateImportFingerprints(legacyRows);
      harness.current!.docs.set(
        `organizations/${ORG}/importHistory/legacy-coexist`,
        legacyInlineDocument(ORG, 'legacy-coexist', USER, legacyFp, legacyRows.length),
      );

      await beginImport(buildAuditRows(600));
      const history = await importHistoryRepository.list(ORG);
      expect(history).toHaveLength(2);
      expect(history.every((record) => record.duplicateMetadataComplete !== false)).toBe(true);
      expect(history.every((record) => record.rowFingerprints.length > 0)).toBe(true);
    });
  });

  describe('Phase 12 — index health interaction', () => {
    it('complete index + complete chunked metadata can use fast path', async () => {
      const histRows = buildAuditRows(600);
      const { session, fp } = await beginImport(histRows);
      await finalizeIndexedHistoryForTests(ORG, USER, [
        {
          importId: session.history.importId,
          importedAt: new Date().toISOString(),
          importedBy: USER,
          reportType: 'sales-detail',
          rowCount: histRows.length,
          fileFingerprint: fp.fileFingerprint,
          invoiceNumbers: fp.invoiceNumbers,
          rowFingerprints: fp.rowFingerprints,
          status: IMPORT_HISTORY_STATUS.COMPLETED,
        },
      ]);

      const review = { rows: buildAuditRows(5) } as ImportReviewViewModelWithResolution;
      const resolved = await resolveImportHistoryForDuplicateDetection(ORG, review);
      expect(resolved.meta.source).toBe('index-empty');
    });
  });

  describe('Phase 13 — file fingerprint reconstruction', () => {
    for (const rowCount of [100, 500, 1_000, 10_000] as const) {
      it(`reconstructed fileFingerprint matches inline for ${rowCount} rows`, async () => {
        const rows = buildAuditRows(rowCount);
        const fp = buildDuplicateImportFingerprints(rows);
        const { session } = await beginImport(rows);
        const loaded = (await importHistoryRepository.getById(ORG, session.history.importId))!;
        expect(fileFingerprintsMatch(fp.fileFingerprint, fp.rowFingerprints, loaded.fileFingerprint)).toBe(true);
      });
    }
  });

  describe('Phase 14 — data quality edge cases', () => {
    it('handles blank invoice numbers without crash', async () => {
      const rows = [
        buildAuditRow(2, { invoice: '' }),
        buildAuditRow(3, { invoice: 'INV-OK' }),
      ];
      const { session, fp } = await beginImport(rows);
      const loaded = await importHistoryRepository.getById(ORG, session.history.importId);
      expect(loaded?.rowFingerprints.length).toBe(fp.rowFingerprints.length);
    });

    it('handles unicode and special characters in row data', async () => {
      const rows = [
        buildAuditRow(2, { customerName: 'Café Müller', productName: 'Naan & Roti "Special"' }),
      ];
      const { session } = await beginImport(rows);
      const loaded = await importHistoryRepository.getById(ORG, session.history.importId);
      expect(loaded?.rowFingerprints.length).toBe(1);
    });
  });

  describe('Phase 16 — read/write integrity round-trip', () => {
    it('write-read round trip preserves exact fingerprint and invoice arrays for 5000 rows', async () => {
      const rows = buildAuditRows(5_000);
      const fp = buildDuplicateImportFingerprints(rows);
      const { session } = await beginImport(rows);
      const loaded = (await importHistoryRepository.getById(ORG, session.history.importId))!;
      expect(loaded.invoiceNumbers).toEqual(fp.invoiceNumbers);
      expect(loaded.rowFingerprints).toEqual(fp.rowFingerprints);
      expect(loaded.rowFingerprints).not.toEqual([...fp.rowFingerprints].reverse());
    });
  });

  afterAll(() => {
    if (AUDIT_STORAGE_RESULTS.length > 0) {
      // eslint-disable-next-line no-console
      console.info('[chunked-storage-audit-table]', AUDIT_STORAGE_RESULTS);
    }
  });
});
