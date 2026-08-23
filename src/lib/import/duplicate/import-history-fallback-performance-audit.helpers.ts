/**
 * Full-history fallback performance audit — shared helpers (TEST ONLY).
 */

import { performance } from 'node:perf_hooks';

import { Timestamp } from 'firebase-admin/firestore';

import {
  buildDuplicateImportFileFingerprint,
  buildDuplicateImportFingerprints,
  detectDuplicateImport,
  IMPORT_HISTORY_STATUS,
  type ImportHistoryRecord,
} from '@/lib/import/duplicate';
import { DUPLICATE_METADATA_STORAGE } from '@/lib/import/duplicate/import-history-duplicate-metadata.types';
import {
  DUPLICATE_METADATA_INVOICE_NUMBERS_PER_CHUNK,
  DUPLICATE_METADATA_ROW_FINGERPRINTS_PER_CHUNK,
} from '@/lib/import/duplicate/import-history-duplicate-metadata.constants';
import type { ResolvedImportReviewRow } from '@/lib/import/resolution/types';
import {
  importHistoryDuplicateMetadataRepository,
} from '@/lib/repositories/import-history-duplicate-metadata.repository';

import {
  buildAuditRow,
  buildAuditRows,
  inlineLogicalRecord,
  legacyInlineDocument,
  type DocMap,
} from '@/lib/import/duplicate/import-history-chunked-storage-audit.helpers';

export type FirestoreReadCounters = {
  collectionGets: number;
  docGets: number;
  queries: number;
  batchCommits: number;
};

export type FallbackPerfMeasurement = {
  historyImportCount: number;
  excelRowCount: number;
  historyRowsPerImport: number;
  storageMode: 'inline' | 'chunked' | 'mixed';
  mainDocsRead: number;
  chunkDocsRead: number;
  totalDocGets: number;
  collectionGets: number;
  queries: number;
  indexLookupCount: number;
  fingerprintsReconstructed: number;
  invoiceNumbersReconstructed: number;
  historyRecordsLoaded: number;
  fallbackSource: string;
  orgCoverage: string;
  detectElapsedMs: number;
  resolveElapsedMs: number;
  totalElapsedMs: number;
  approximateMemoryBytes: number;
};

export const FALLBACK_PERF_RESULTS: FallbackPerfMeasurement[] = [];

export function expectedChunkReadsForImport(
  rowFingerprintCount: number,
  invoiceCount: number,
  storage: 'inline' | 'chunked',
): number {
  if (storage === 'inline') {
    return 0;
  }

  return (
    importHistoryDuplicateMetadataRepository.expectedRowChunkCount(rowFingerprintCount) +
    importHistoryDuplicateMetadataRepository.expectedInvoiceChunkCount(invoiceCount)
  );
}

export function buildSyntheticHistoryRecord(
  importIndex: number,
  rowsPerImport: number,
  userId: string,
  options: {
    storage?: 'inline' | 'chunked';
    duplicateRowIndex?: number;
    duplicateSourceImportIndex?: number;
  } = {},
): {
  record: ImportHistoryRecord;
  rows: ResolvedImportReviewRow[];
  fingerprints: ReturnType<typeof buildDuplicateImportFingerprints>;
} {
  const rows = Array.from({ length: rowsPerImport }, (_, rowOffset) => {
    const globalRow = importIndex * 10_000 + rowOffset;
    const duplicateFrom =
      options.duplicateSourceImportIndex !== undefined &&
      options.duplicateRowIndex !== undefined &&
      importIndex === options.duplicateSourceImportIndex
        ? options.duplicateRowIndex
        : null;

    if (duplicateFrom !== null && rowOffset === 0) {
      return buildAuditRow(duplicateFrom + 2, { invoice: `DUP-INV-${duplicateFrom}` });
    }

    return buildAuditRow(globalRow + 2, { invoice: `HIST-${importIndex}-${rowOffset}` });
  });

  const fingerprints = buildDuplicateImportFingerprints(rows);
  const useChunked =
    options.storage === 'chunked' ||
    (options.storage !== 'inline' &&
      fingerprints.rowFingerprints.length >= 500);

  const record = inlineLogicalRecord(`hist-${importIndex}`, userId, fingerprints);
  record.importId = `hist-${importIndex}`;
  record.importedAt = new Date(Date.UTC(2026, 0, 1, 0, 0, importIndex)).toISOString();
  record.duplicateMetadataStorage = useChunked
    ? DUPLICATE_METADATA_STORAGE.CHUNKED
    : DUPLICATE_METADATA_STORAGE.INLINE;
  record.duplicateMetadataComplete = true;
  record.duplicateMetadataRowChunkCount = useChunked
    ? importHistoryDuplicateMetadataRepository.expectedRowChunkCount(fingerprints.rowFingerprints.length)
    : 0;
  record.duplicateMetadataInvoiceChunkCount = useChunked
    ? importHistoryDuplicateMetadataRepository.expectedInvoiceChunkCount(fingerprints.invoiceNumbers.length)
    : 0;

  return { record, rows, fingerprints };
}

export function estimateHistoryMemoryBytes(records: readonly ImportHistoryRecord[]): number {
  let bytes = 0;

  for (const record of records) {
    bytes += Buffer.byteLength(JSON.stringify(record), 'utf8');
  }

  return bytes;
}

export function measureDetectDuplicateOnly(
  excelRows: readonly ResolvedImportReviewRow[],
  importHistory: readonly ImportHistoryRecord[],
): { elapsedMs: number; result: ReturnType<typeof detectDuplicateImport> } {
  const started = performance.now();
  const result = detectDuplicateImport({
    resolvedReview: { rows: excelRows } as never,
    importHistory,
  });
  return { elapsedMs: performance.now() - started, result };
}

export function recordFallbackPerf(measurement: FallbackPerfMeasurement): void {
  FALLBACK_PERF_RESULTS.push(measurement);
}

export function seedInlineHistoryDoc(
  docs: DocMap,
  orgId: string,
  userId: string,
  importId: string,
  fingerprints: ReturnType<typeof buildDuplicateImportFingerprints>,
  status = IMPORT_HISTORY_STATUS.COMPLETED,
): void {
  docs.set(
    `organizations/${orgId}/importHistory/${importId}`,
    {
      ...legacyInlineDocument(orgId, importId, userId, fingerprints, fingerprints.rowFingerprints.length),
      status,
    },
  );
}

export function seedChunkedHistoryDoc(
  docs: DocMap,
  orgId: string,
  userId: string,
  importId: string,
  fingerprints: ReturnType<typeof buildDuplicateImportFingerprints>,
  status = IMPORT_HISTORY_STATUS.COMPLETED,
): void {
  const rowCount = fingerprints.rowFingerprints.length;
  const rowChunkCount = importHistoryDuplicateMetadataRepository.expectedRowChunkCount(rowCount);
  const invoiceChunkCount = importHistoryDuplicateMetadataRepository.expectedInvoiceChunkCount(
    fingerprints.invoiceNumbers.length,
  );

  docs.set(`organizations/${orgId}/importHistory/${importId}`, {
    organizationId: orgId,
    reportType: 'sales-detail',
    rowCount,
    rowsImported: rowCount,
    rowsSkipped: 0,
    rowsFailed: 0,
    fileFingerprint: '',
    invoiceNumbers: [],
    rowFingerprints: [],
    saleIds: [],
    executionStatus: 'imported',
    status,
    createdAt: Timestamp.now(),
    createdBy: userId,
    updatedAt: Timestamp.now(),
    updatedBy: userId,
    deletedAt: null,
    deletedBy: null,
    duplicateMetadataStorage: DUPLICATE_METADATA_STORAGE.CHUNKED,
    duplicateMetadataComplete: true,
    duplicateMetadataRowChunkCount: rowChunkCount,
    duplicateMetadataInvoiceChunkCount: invoiceChunkCount,
  });

  for (let chunkIndex = 0; chunkIndex < rowChunkCount; chunkIndex += 1) {
    const start = chunkIndex * DUPLICATE_METADATA_ROW_FINGERPRINTS_PER_CHUNK;
    const end = start + DUPLICATE_METADATA_ROW_FINGERPRINTS_PER_CHUNK;
    const values = fingerprints.rowFingerprints.slice(start, end);

    docs.set(`organizations/${orgId}/importHistory/${importId}/duplicateMetadata/row-${String(chunkIndex).padStart(4, '0')}`, {
      organizationId: orgId,
      importId,
      kind: 'rowFingerprints',
      chunkIndex,
      values,
      createdAt: Timestamp.now(),
      createdBy: userId,
    });
  }

  for (let chunkIndex = 0; chunkIndex < invoiceChunkCount; chunkIndex += 1) {
    const start = chunkIndex * DUPLICATE_METADATA_INVOICE_NUMBERS_PER_CHUNK;
    const end = start + DUPLICATE_METADATA_INVOICE_NUMBERS_PER_CHUNK;
    const values = fingerprints.invoiceNumbers.slice(start, end);

    docs.set(`organizations/${orgId}/importHistory/${importId}/duplicateMetadata/inv-${String(chunkIndex).padStart(4, '0')}`, {
      organizationId: orgId,
      importId,
      kind: 'invoiceNumbers',
      chunkIndex,
      values,
      createdAt: Timestamp.now(),
      createdBy: userId,
    });
  }
}

export function buildExcelRows(count: number, prefix = 'CUR'): ResolvedImportReviewRow[] {
  return buildAuditRows(count, prefix);
}

export function buildExactDuplicateExcelFromHistory(
  historyRows: readonly ResolvedImportReviewRow[],
): ResolvedImportReviewRow[] {
  return historyRows.map((row) => ({ ...row }));
}

export { buildDuplicateImportFileFingerprint, buildDuplicateImportFingerprints };
