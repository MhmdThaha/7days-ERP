/**
 * Chunked importHistory duplicate metadata — size, parity, and safety tests (TEST ONLY).
 */

import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildDuplicateImportFingerprints,
  buildDuplicateImportRowFingerprint,
  detectDuplicateImport,
  DUPLICATE_IMPORT_STATUS,
  IMPORT_HISTORY_STATUS,
  type ImportHistoryRecord,
} from '@/lib/import/duplicate';
import { DUPLICATE_METADATA_STORAGE } from '@/lib/import/duplicate/import-history-duplicate-metadata.types';
import {
  DUPLICATE_METADATA_CHUNK_THRESHOLD_ROWS,
  DUPLICATE_METADATA_ROW_FINGERPRINTS_PER_CHUNK,
} from '@/lib/import/duplicate/import-history-duplicate-metadata.constants';
import type { ImportReviewViewModelWithResolution, ResolvedImportReviewRow } from '@/lib/import/resolution/types';
import {
  estimateChunkedDuplicateMetadataLayout,
  estimateInlineDuplicateMetadataBytes,
} from '@/lib/repositories/import-history-duplicate-metadata.repository';
import { importHistoryRepository } from '@/lib/repositories/import-history.repository';

const FIRESTORE_DOCUMENT_LIMIT_BYTES = 1_048_576;

type DocMap = Map<string, Record<string, unknown>>;

function createInMemoryFirestore() {
  const docs: DocMap = new Map();
  let autoId = 0;

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
          get: async () => ({
            exists: docs.has(path),
            id: docId,
            data: () => docs.get(path),
          }),
          set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
            const previous = docs.get(path);
            docs.set(path, options?.merge && previous ? { ...previous, ...data } : { ...data });
          },
          update: async (data: Record<string, unknown>) => {
            const previous = docs.get(path) ?? {};
            docs.set(path, { ...previous, ...data });
          },
        };
      },
      where(field: string, op: string, value: unknown) {
        const filters = [{ field, op, value }];

        const query = {
          where(nextField: string, nextOp: string, nextValue: unknown) {
            filters.push({ field: nextField, op: nextOp, value: nextValue });
            return query;
          },
          limit(_count: number) {
            return query;
          },
          get: async () => {
            const matches = [...docs.entries()].filter(([path, data]) => {
              const suffix = path.slice(basePath.length + 1);
              const isDirectChild = path.startsWith(`${basePath}/`) && !suffix.includes('/');

              if (!isDirectChild) {
                return false;
              }

              return filters.every((filter) => filter.op === '==' && data[filter.field] === filter.value);
            });

            return {
              docs: matches.map(([path, data]) => ({
                id: path.slice(basePath.length + 1),
                data: () => data,
              })),
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
          .map(([path, data]) => ({
            id: path.slice(basePath.length + 1),
            data: () => data,
          })),
      }),
    };
  }

  const db = {
    collection: (name: string) => {
      const root = collectionAt(name);
      return {
        ...root,
        doc(id?: string) {
          const ref = root.doc(id);
          return {
            ...ref,
            collection(subName: string) {
              return collectionAt(`${ref.path}/${subName}`);
            },
          };
        },
      };
    },
    batch: () => {
      const ops: Array<{ path: string; data: Record<string, unknown> }> = [];
      return {
        set(ref: { path: string }, data: Record<string, unknown>) {
          ops.push({ path: ref.path, data: { ...data } });
        },
        async commit() {
          for (const op of ops) {
            docs.set(op.path, op.data);
          }
        },
      };
    },
    runTransaction: async (
      fn: (tx: {
        get: (ref: { path: string }) => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
        set: (ref: { path: string }, data: Record<string, unknown>) => void;
      }) => Promise<unknown>,
    ) => fn({
      get: async (ref) => ({
        exists: docs.has(ref.path),
        data: () => docs.get(ref.path),
      }),
      set: (ref, data) => {
        docs.set(ref.path, { ...data });
      },
    }),
  };

  return { docs, db };
}

const harness = vi.hoisted(() => ({
  current: null as ReturnType<typeof createInMemoryFirestore> | null,
}));

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => harness.current!.db,
}));

const ORG = 'org-chunk-meta';
const USER = 'chunk-user';

function buildRow(rowNumber: number, invoice: string): ResolvedImportReviewRow {
  const values = {
    saleDate: '2026-08-21',
    customerName: `Store ${rowNumber % 50}`,
    productName: `Product ${rowNumber % 20}`,
    quantity: (rowNumber % 5) + 1,
    saleNumber: invoice,
  };

  return {
    rowNumber,
    originalValues: values,
    normalizedValues: values,
    reportDetectionResult: {} as never,
    productMatchResult: { matchedProductId: `prod-${rowNumber % 20}` } as never,
    conflictEngineResult: {} as never,
    confidenceResult: {} as never,
  };
}

function buildRows(count: number) {
  return Array.from({ length: count }, (_, index) => buildRow(index + 2, `INV-${index}`));
}

function legacyRecord(
  importId: string,
  fingerprints: ReturnType<typeof buildDuplicateImportFingerprints>,
): ImportHistoryRecord {
  return {
    importId,
    importedAt: new Date().toISOString(),
    importedBy: USER,
    reportType: 'sales-detail',
    rowCount: fingerprints.rowFingerprints.length,
    fileFingerprint: fingerprints.fileFingerprint,
    invoiceNumbers: fingerprints.invoiceNumbers,
    rowFingerprints: fingerprints.rowFingerprints,
    status: IMPORT_HISTORY_STATUS.COMPLETED,
    duplicateMetadataComplete: true,
    duplicateMetadataStorage: DUPLICATE_METADATA_STORAGE.INLINE,
  };
}

describe('importHistory duplicate metadata chunking', () => {
  beforeEach(() => {
    harness.current = createInMemoryFirestore();
  });

  for (const rowCount of [100, 1_000, 5_000, 10_000, 20_000, 50_000] as const) {
    it(`estimates safe layout for ${rowCount} rows`, () => {
      const rows = buildRows(rowCount);
      const fingerprints = buildDuplicateImportFingerprints(rows);
      const layout = estimateChunkedDuplicateMetadataLayout(
        fingerprints.invoiceNumbers,
        fingerprints.rowFingerprints,
      );
      const inlineBytes = estimateInlineDuplicateMetadataBytes(
        fingerprints.invoiceNumbers,
        fingerprints.rowFingerprints,
      );

      if (rowCount >= DUPLICATE_METADATA_CHUNK_THRESHOLD_ROWS) {
        expect(layout.storage).toBe(DUPLICATE_METADATA_STORAGE.CHUNKED);
        expect(layout.largestChunkBytes).toBeLessThan(DUPLICATE_METADATA_ROW_FINGERPRINTS_PER_CHUNK * 400);
        expect(layout.metadataDocumentBytes).toBeLessThan(8_192);
        expect(layout.largestChunkBytes).toBeLessThan(FIRESTORE_DOCUMENT_LIMIT_BYTES * 0.5);
      } else {
        expect(layout.storage).toBe(DUPLICATE_METADATA_STORAGE.INLINE);
      }

      if (rowCount >= 10_000) {
        expect(inlineBytes).toBeGreaterThan(FIRESTORE_DOCUMENT_LIMIT_BYTES * 0.5);
      }
    });
  }

  it('writes and reads chunked metadata with identical logical arrays', async () => {
    const rows = buildRows(DUPLICATE_METADATA_CHUNK_THRESHOLD_ROWS);
    const fingerprints = buildDuplicateImportFingerprints(rows);

    const session = await importHistoryRepository.beginOrResume(ORG, USER, {
      reportType: 'sales-detail',
      rowCount: rows.length,
      fileFingerprint: fingerprints.fileFingerprint,
      invoiceNumbers: fingerprints.invoiceNumbers,
      rowFingerprints: fingerprints.rowFingerprints,
    });

    const loaded = await importHistoryRepository.getById(ORG, session.history.importId);

    expect(loaded?.duplicateMetadataStorage).toBe(DUPLICATE_METADATA_STORAGE.CHUNKED);
    expect(loaded?.duplicateMetadataComplete).toBe(true);
    expect(loaded?.invoiceNumbers).toEqual(fingerprints.invoiceNumbers);
    expect(loaded?.rowFingerprints).toEqual(fingerprints.rowFingerprints);

    const mainDoc = harness.current!.docs.get(
      `organizations/${ORG}/importHistory/${session.history.importId}`,
    );

    expect(mainDoc?.invoiceNumbers).toEqual([]);
    expect(mainDoc?.rowFingerprints).toEqual([]);
    expect((mainDoc?.duplicateMetadataRowChunkCount as number) ?? 0).toBeGreaterThan(0);
  });

  it('preserves duplicate detection parity between inline and chunked storage', async () => {
    const rows = buildRows(DUPLICATE_METADATA_CHUNK_THRESHOLD_ROWS + 50);
    const fingerprints = buildDuplicateImportFingerprints(rows);
    const review = { rows } as ImportReviewViewModelWithResolution;

    const inlineHistory = legacyRecord('imp-inline', fingerprints);
    const session = await importHistoryRepository.beginOrResume(ORG, USER, {
      reportType: 'sales-detail',
      rowCount: rows.length,
      fileFingerprint: fingerprints.fileFingerprint,
      invoiceNumbers: fingerprints.invoiceNumbers,
      rowFingerprints: fingerprints.rowFingerprints,
    });
    const chunkedHistory = await importHistoryRepository.getById(ORG, session.history.importId);

    const inlineResult = detectDuplicateImport({
      resolvedReview: review,
      importHistory: [inlineHistory],
    });
    const chunkedResult = detectDuplicateImport({
      resolvedReview: review,
      importHistory: [chunkedHistory!],
    });

    expect(chunkedResult.status).toBe(inlineResult.status);
    expect(chunkedResult.matchedRows).toBe(inlineResult.matchedRows);
    expect([...chunkedResult.duplicateRowFingerprints].sort()).toEqual(
      [...inlineResult.duplicateRowFingerprints].sort(),
    );
    expect(chunkedResult.status).toBe(DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE);
  });

  it('detects incomplete chunked metadata as unsafe', async () => {
    const rows = buildRows(DUPLICATE_METADATA_CHUNK_THRESHOLD_ROWS);
    const fingerprints = buildDuplicateImportFingerprints(rows);
    const session = await importHistoryRepository.beginOrResume(ORG, USER, {
      reportType: 'sales-detail',
      rowCount: rows.length,
      fileFingerprint: fingerprints.fileFingerprint,
      invoiceNumbers: fingerprints.invoiceNumbers,
      rowFingerprints: fingerprints.rowFingerprints,
    });

    const mainPath = `organizations/${ORG}/importHistory/${session.history.importId}`;
    harness.current!.docs.set(mainPath, {
      ...harness.current!.docs.get(mainPath)!,
      duplicateMetadataComplete: false,
    });

    const missingChunkPath = `organizations/${ORG}/importHistory/${session.history.importId}/duplicateMetadata/row-0001`;
    harness.current!.docs.delete(missingChunkPath);

    const loaded = await importHistoryRepository.getById(ORG, session.history.importId);

    expect(loaded?.duplicateMetadataComplete).toBe(false);
    expect(loaded?.rowFingerprints).toEqual([]);
    expect(await importHistoryRepository.hasIncompleteDuplicateMetadata(ORG)).toBe(true);
  });

  it('reads legacy inline documents without migration', async () => {
    const rows = buildRows(10);
    const fingerprints = buildDuplicateImportFingerprints(rows);
    const importId = 'legacy-inline';

    harness.current!.docs.set(`organizations/${ORG}/importHistory/${importId}`, {
      organizationId: ORG,
      reportType: 'sales-detail',
      rowCount: rows.length,
      rowsImported: rows.length,
      rowsSkipped: 0,
      rowsFailed: 0,
      fileFingerprint: fingerprints.fileFingerprint,
      invoiceNumbers: [...fingerprints.invoiceNumbers],
      rowFingerprints: [...fingerprints.rowFingerprints],
      saleIds: [],
      executionStatus: 'imported',
      status: IMPORT_HISTORY_STATUS.COMPLETED,
      createdAt: Timestamp.now(),
      createdBy: USER,
      updatedAt: Timestamp.now(),
      updatedBy: USER,
      deletedAt: null,
      deletedBy: null,
    });

    const loaded = await importHistoryRepository.getById(ORG, importId);

    expect(loaded?.duplicateMetadataStorage).toBe(DUPLICATE_METADATA_STORAGE.INLINE);
    expect(loaded?.invoiceNumbers).toEqual(fingerprints.invoiceNumbers);
    expect(loaded?.rowFingerprints).toEqual(fingerprints.rowFingerprints);
  });

  it('stores 10k-row import without oversized main document', async () => {
    const rows = buildRows(10_000);
    const fingerprints = buildDuplicateImportFingerprints(rows);

    const session = await importHistoryRepository.beginOrResume(ORG, USER, {
      reportType: 'sales-detail',
      rowCount: rows.length,
      fileFingerprint: fingerprints.fileFingerprint,
      invoiceNumbers: fingerprints.invoiceNumbers,
      rowFingerprints: fingerprints.rowFingerprints,
    });

    const mainPath = `organizations/${ORG}/importHistory/${session.history.importId}`;
    const mainDoc = harness.current!.docs.get(mainPath)!;

    expect(mainDoc?.fileFingerprint).toBe('');
    const mainDocBytes = Buffer.byteLength(JSON.stringify(mainDoc), 'utf8');

    let largestChunkBytes = 0;
    let chunkCount = 0;

    for (const [path, data] of harness.current!.docs.entries()) {
      if (path.includes('/duplicateMetadata/')) {
        chunkCount += 1;
        largestChunkBytes = Math.max(
          largestChunkBytes,
          Buffer.byteLength(JSON.stringify(data), 'utf8'),
        );
      }
    }

    expect(mainDocBytes).toBeLessThan(16_384);
    expect(chunkCount).toBe(15);
    expect(largestChunkBytes).toBeLessThan(FIRESTORE_DOCUMENT_LIMIT_BYTES * 0.5);

    const loaded = await importHistoryRepository.getById(ORG, session.history.importId);
    expect(loaded?.rowFingerprints).toHaveLength(10_000);
  });
});
