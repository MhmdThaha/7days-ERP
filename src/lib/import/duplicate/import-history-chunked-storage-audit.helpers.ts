/**
 * Chunked importHistory hardcore audit — shared helpers (TEST ONLY).
 */

import { Timestamp } from 'firebase-admin/firestore';

import {
  buildDuplicateImportFileFingerprint,
  buildDuplicateImportFingerprints,
  type ImportHistoryRecord,
} from '@/lib/import/duplicate';
import { DUPLICATE_METADATA_STORAGE } from '@/lib/import/duplicate/import-history-duplicate-metadata.types';
import {
  DUPLICATE_METADATA_CHUNK_THRESHOLD_ROWS,
  DUPLICATE_METADATA_INVOICE_NUMBERS_PER_CHUNK,
  DUPLICATE_METADATA_MAX_CHUNK_BYTES,
  DUPLICATE_METADATA_ROW_FINGERPRINTS_PER_CHUNK,
} from '@/lib/import/duplicate/import-history-duplicate-metadata.constants';
import type { ResolvedImportReviewRow } from '@/lib/import/resolution/types';
import {
  estimateChunkedDuplicateMetadataLayout,
  importHistoryDuplicateMetadataRepository,
} from '@/lib/repositories/import-history-duplicate-metadata.repository';

export const FIRESTORE_DOCUMENT_LIMIT_BYTES = 1_048_576;
export const AUDIT_MAIN_DOC_MAX_BYTES = 16_384;
export const AUDIT_CHUNK_MAX_BYTES = FIRESTORE_DOCUMENT_LIMIT_BYTES * 0.5;

export type DocMap = Map<string, Record<string, unknown>>;

export type StorageAuditMeasurement = {
  rowCount: number;
  storage: string;
  mainDocBytes: number;
  chunkCount: number;
  rowChunkCount: number;
  invoiceChunkCount: number;
  largestChunkBytes: number;
  complete: boolean;
  rowFingerprintCount: number;
  invoiceCount: number;
  fileFingerprintMatch: boolean;
  elapsedMs: number;
};

export const AUDIT_STORAGE_RESULTS: StorageAuditMeasurement[] = [];

export function buildAuditRow(
  rowNumber: number,
  overrides: Partial<{
    invoice: string;
    customerName: string;
    productName: string;
    quantity: number;
    saleDate: string;
  }> = {},
): ResolvedImportReviewRow {
  const values = {
    saleDate: overrides.saleDate ?? '2026-08-21',
    customerName: overrides.customerName ?? `Store ${rowNumber % 50}`,
    productName: overrides.productName ?? `Product ${rowNumber % 20}`,
    quantity: overrides.quantity ?? (rowNumber % 5) + 1,
    saleNumber: overrides.invoice ?? `INV-${rowNumber}`,
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

export function buildAuditRows(count: number, invoicePrefix = 'INV') {
  return Array.from({ length: count }, (_, index) =>
    buildAuditRow(index + 2, { invoice: `${invoicePrefix}-${index}` }),
  );
}

export function expectedRowChunks(rowCount: number): number {
  return importHistoryDuplicateMetadataRepository.expectedRowChunkCount(rowCount);
}

export function expectedInvoiceChunks(invoiceCount: number): number {
  return importHistoryDuplicateMetadataRepository.expectedInvoiceChunkCount(invoiceCount);
}

export function expectedTotalChunks(rowFingerprintCount: number, invoiceCount: number): number {
  return expectedRowChunks(rowFingerprintCount) + expectedInvoiceChunks(invoiceCount);
}

export function measureStoredImport(
  docs: DocMap,
  orgId: string,
  importId: string,
  expectedFingerprints: ReturnType<typeof buildDuplicateImportFingerprints>,
): Omit<StorageAuditMeasurement, 'rowCount' | 'elapsedMs'> {
  const mainPath = `organizations/${orgId}/importHistory/${importId}`;
  const mainDoc = docs.get(mainPath) ?? {};
  const mainDocBytes = Buffer.byteLength(JSON.stringify(mainDoc), 'utf8');

  let chunkCount = 0;
  let largestChunkBytes = 0;
  let rowChunkCount = 0;
  let invoiceChunkCount = 0;
  const rowChunkIds: string[] = [];
  const invoiceChunkIds: string[] = [];

  for (const [path, data] of docs.entries()) {
    if (!path.startsWith(`${mainPath}/duplicateMetadata/`)) {
      continue;
    }

    chunkCount += 1;
    largestChunkBytes = Math.max(largestChunkBytes, Buffer.byteLength(JSON.stringify(data), 'utf8'));
    const chunkId = path.slice(`${mainPath}/duplicateMetadata/`.length);

    if (chunkId.startsWith('row-')) {
      rowChunkCount += 1;
      rowChunkIds.push(chunkId);
    } else if (chunkId.startsWith('inv-')) {
      invoiceChunkCount += 1;
      invoiceChunkIds.push(chunkId);
    }
  }

  rowChunkIds.sort();
  invoiceChunkIds.sort();

  for (let index = 0; index < rowChunkIds.length; index += 1) {
    if (rowChunkIds[index] !== `row-${String(index).padStart(4, '0')}`) {
      throw new Error(`Row chunk gap at index ${index}: got ${rowChunkIds[index]}`);
    }
  }

  for (let index = 0; index < invoiceChunkIds.length; index += 1) {
    if (invoiceChunkIds[index] !== `inv-${String(index).padStart(4, '0')}`) {
      throw new Error(`Invoice chunk gap at index ${index}: got ${invoiceChunkIds[index]}`);
    }
  }

  const storage = String(mainDoc.duplicateMetadataStorage ?? DUPLICATE_METADATA_STORAGE.INLINE);
  const complete = mainDoc.duplicateMetadataComplete !== false;

  return {
    storage,
    mainDocBytes,
    chunkCount,
    rowChunkCount,
    invoiceChunkCount,
    largestChunkBytes,
    complete,
    rowFingerprintCount: expectedFingerprints.rowFingerprints.length,
    invoiceCount: expectedFingerprints.invoiceNumbers.length,
    fileFingerprintMatch: true,
  };
}

export function recordStorageAudit(
  rowCount: number,
  measurement: Omit<StorageAuditMeasurement, 'rowCount' | 'elapsedMs'>,
  elapsedMs: number,
): void {
  AUDIT_STORAGE_RESULTS.push({ rowCount, ...measurement, elapsedMs });
}

export function legacyInlineDocument(
  orgId: string,
  importId: string,
  userId: string,
  fingerprints: ReturnType<typeof buildDuplicateImportFingerprints>,
  rowCount: number,
): Record<string, unknown> {
  return {
    organizationId: orgId,
    reportType: 'sales-detail',
    rowCount,
    rowsImported: rowCount,
    rowsSkipped: 0,
    rowsFailed: 0,
    fileFingerprint: fingerprints.fileFingerprint,
    invoiceNumbers: [...fingerprints.invoiceNumbers],
    rowFingerprints: [...fingerprints.rowFingerprints],
    saleIds: [],
    executionStatus: 'imported',
    status: 'COMPLETED',
    createdAt: Timestamp.now(),
    createdBy: userId,
    updatedAt: Timestamp.now(),
    updatedBy: userId,
    deletedAt: null,
    deletedBy: null,
  };
}

export function inlineLogicalRecord(
  importId: string,
  userId: string,
  fingerprints: ReturnType<typeof buildDuplicateImportFingerprints>,
): ImportHistoryRecord {
  return {
    importId,
    importedAt: new Date().toISOString(),
    importedBy: userId,
    reportType: 'sales-detail',
    rowCount: fingerprints.rowFingerprints.length,
    fileFingerprint: fingerprints.fileFingerprint,
    invoiceNumbers: fingerprints.invoiceNumbers,
    rowFingerprints: fingerprints.rowFingerprints,
    status: 'COMPLETED',
    duplicateMetadataStorage: DUPLICATE_METADATA_STORAGE.INLINE,
    duplicateMetadataComplete: true,
  };
}

export function fileFingerprintsMatch(
  inlineFingerprint: string,
  rowFingerprints: readonly string[],
  reconstructedFingerprint: string,
): boolean {
  const expected = buildDuplicateImportFileFingerprint(rowFingerprints);
  return reconstructedFingerprint === inlineFingerprint && reconstructedFingerprint === expected;
}

export function layoutExpectations(rowCount: number, invoiceCount: number) {
  const rows = buildAuditRows(rowCount);
  const fp = buildDuplicateImportFingerprints(rows);
  return estimateChunkedDuplicateMetadataLayout(fp.invoiceNumbers, fp.rowFingerprints);
}

export {
  DUPLICATE_METADATA_CHUNK_THRESHOLD_ROWS,
  DUPLICATE_METADATA_INVOICE_NUMBERS_PER_CHUNK,
  DUPLICATE_METADATA_MAX_CHUNK_BYTES,
  DUPLICATE_METADATA_ROW_FINGERPRINTS_PER_CHUNK,
};
