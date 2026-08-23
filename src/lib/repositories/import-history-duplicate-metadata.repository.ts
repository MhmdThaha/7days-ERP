import 'server-only';

import { Timestamp, type DocumentReference } from 'firebase-admin/firestore';

import {
  DUPLICATE_METADATA_CHUNK_THRESHOLD_ROWS,
  DUPLICATE_METADATA_CHUNK_READ_CONCURRENCY,
  DUPLICATE_METADATA_INVOICE_NUMBERS_PER_CHUNK,
  DUPLICATE_METADATA_ROW_FINGERPRINTS_PER_CHUNK,
  DUPLICATE_METADATA_SUBCOLLECTION,
} from '@/lib/import/duplicate/import-history-duplicate-metadata.constants';
import {
  DUPLICATE_METADATA_CHUNK_KIND,
  DUPLICATE_METADATA_STORAGE,
  type DuplicateMetadataStorage,
  type ImportDuplicateMetadataChunkDocument,
  type ImportDuplicateMetadataReadResult,
  type ImportDuplicateMetadataWriteInput,
  type ImportDuplicateMetadataWriteResult,
} from '@/lib/import/duplicate/import-history-duplicate-metadata.types';
import { IMPORT_DUPLICATE_INDEX_MAX_BATCH_WRITES } from '@/lib/repositories/import-duplicate-index.repository';
import { getFirestore, getOrgCollection } from '@/lib/repositories/base.repository';

const COLLECTION = 'importHistory';

function chunkDocId(kind: typeof DUPLICATE_METADATA_CHUNK_KIND[keyof typeof DUPLICATE_METADATA_CHUNK_KIND], chunkIndex: number): string {
  const prefix =
    kind === DUPLICATE_METADATA_CHUNK_KIND.ROW_FINGERPRINTS ? 'row' : 'inv';

  return `${prefix}-${String(chunkIndex).padStart(4, '0')}`;
}

function chunkValues<T>(values: readonly T[], size: number): T[][] {
  if (values.length === 0) {
    return [];
  }

  const chunks: T[][] = [];

  for (let offset = 0; offset < values.length; offset += size) {
    chunks.push(values.slice(offset, offset + size));
  }

  return chunks;
}

function expectedChunkCount(valuesLength: number, perChunk: number): number {
  return valuesLength === 0 ? 0 : Math.ceil(valuesLength / perChunk);
}

export function shouldChunkDuplicateMetadata(rowFingerprintCount: number): boolean {
  return rowFingerprintCount >= DUPLICATE_METADATA_CHUNK_THRESHOLD_ROWS;
}

export function estimateInlineDuplicateMetadataBytes(
  invoiceNumbers: readonly string[],
  rowFingerprints: readonly string[],
): number {
  let bytes = 0;

  for (const value of invoiceNumbers) {
    bytes += Buffer.byteLength(value, 'utf8') + 32;
  }

  for (const value of rowFingerprints) {
    bytes += Buffer.byteLength(value, 'utf8') + 32;
  }

  return bytes;
}

export function estimateChunkedDuplicateMetadataLayout(
  invoiceNumbers: readonly string[],
  rowFingerprints: readonly string[],
): {
  storage: DuplicateMetadataStorage;
  rowChunkCount: number;
  invoiceChunkCount: number;
  metadataDocumentBytes: number;
  largestChunkBytes: number;
} {
  const storage = shouldChunkDuplicateMetadata(rowFingerprints.length)
    ? DUPLICATE_METADATA_STORAGE.CHUNKED
    : DUPLICATE_METADATA_STORAGE.INLINE;

  if (storage === DUPLICATE_METADATA_STORAGE.INLINE) {
    const inlineBytes = estimateInlineDuplicateMetadataBytes(invoiceNumbers, rowFingerprints);

    return {
      storage,
      rowChunkCount: 0,
      invoiceChunkCount: 0,
      metadataDocumentBytes: inlineBytes + 512,
      largestChunkBytes: inlineBytes + 512,
    };
  }

  const rowChunks = chunkValues(rowFingerprints, DUPLICATE_METADATA_ROW_FINGERPRINTS_PER_CHUNK);
  const invoiceChunks = chunkValues(invoiceNumbers, DUPLICATE_METADATA_INVOICE_NUMBERS_PER_CHUNK);
  let largestChunkBytes = 256;

  for (const chunk of rowChunks) {
    largestChunkBytes = Math.max(
      largestChunkBytes,
      estimateInlineDuplicateMetadataBytes([], chunk) + 256,
    );
  }

  for (const chunk of invoiceChunks) {
    largestChunkBytes = Math.max(
      largestChunkBytes,
      estimateInlineDuplicateMetadataBytes(chunk, []) + 256,
    );
  }

  return {
    storage,
    rowChunkCount: rowChunks.length,
    invoiceChunkCount: invoiceChunks.length,
    metadataDocumentBytes: 768,
    largestChunkBytes,
  };
}

async function commitChunkWrites(
  writes: Array<{ ref: DocumentReference; data: ImportDuplicateMetadataChunkDocument }>,
): Promise<void> {
  const firestore = getFirestore();

  for (let offset = 0; offset < writes.length; offset += IMPORT_DUPLICATE_INDEX_MAX_BATCH_WRITES) {
    const slice = writes.slice(offset, offset + IMPORT_DUPLICATE_INDEX_MAX_BATCH_WRITES);
    const batch = firestore.batch();

    for (const write of slice) {
      batch.set(write.ref, write.data);
    }

    await batch.commit();
  }
}

function duplicateMetadataCollection(orgId: string, importId: string) {
  return getOrgCollection(orgId, COLLECTION).doc(importId).collection(DUPLICATE_METADATA_SUBCOLLECTION);
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await fn(items[currentIndex]!, currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

const INCOMPLETE_CHUNKED_READ_RESULT = (
  rowChunkCount: number,
  invoiceChunkCount: number,
): ImportDuplicateMetadataReadResult => ({
  invoiceNumbers: [],
  rowFingerprints: [],
  storage: DUPLICATE_METADATA_STORAGE.CHUNKED,
  complete: false,
  rowChunkCount,
  invoiceChunkCount,
});

async function readChunkValuesSequential(
  metadataCollection: ReturnType<typeof duplicateMetadataCollection>,
  kind: typeof DUPLICATE_METADATA_CHUNK_KIND[keyof typeof DUPLICATE_METADATA_CHUNK_KIND],
  chunkCount: number,
): Promise<{ ok: true; values: string[] } | { ok: false }> {
  const values: string[] = [];

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const snapshot = await metadataCollection
      .doc(chunkDocId(kind, chunkIndex))
      .get();

    if (!snapshot.exists) {
      return { ok: false };
    }

    const data = snapshot.data() as ImportDuplicateMetadataChunkDocument;
    values.push(...data.values);
  }

  return { ok: true, values };
}

async function readChunkValuesParallel(
  metadataCollection: ReturnType<typeof duplicateMetadataCollection>,
  kind: typeof DUPLICATE_METADATA_CHUNK_KIND[keyof typeof DUPLICATE_METADATA_CHUNK_KIND],
  chunkCount: number,
): Promise<{ ok: true; values: string[] } | { ok: false }> {
  if (chunkCount === 0) {
    return { ok: true, values: [] };
  }

  const chunkIndices = Array.from({ length: chunkCount }, (_, index) => index);
  const snapshots = await mapWithConcurrency(
    chunkIndices,
    DUPLICATE_METADATA_CHUNK_READ_CONCURRENCY,
    async (chunkIndex) => {
      const snapshot = await metadataCollection
        .doc(chunkDocId(kind, chunkIndex))
        .get();

      return { chunkIndex, snapshot };
    },
  );

  snapshots.sort((left, right) => left.chunkIndex - right.chunkIndex);

  const values: string[] = [];

  for (const { snapshot } of snapshots) {
    if (!snapshot.exists) {
      return { ok: false };
    }

    const data = snapshot.data() as ImportDuplicateMetadataChunkDocument;
    values.push(...data.values);
  }

  return { ok: true, values };
}

async function readChunkedDuplicateMetadata(
  orgId: string,
  importId: string,
  expected: {
    rowChunkCount: number;
    invoiceChunkCount: number;
    complete: boolean;
  },
  readChunkValues: typeof readChunkValuesParallel,
): Promise<ImportDuplicateMetadataReadResult> {
  const { rowChunkCount, invoiceChunkCount } = expected;

  if (!expected.complete) {
    return INCOMPLETE_CHUNKED_READ_RESULT(rowChunkCount, invoiceChunkCount);
  }

  const metadataCollection = duplicateMetadataCollection(orgId, importId);
  const rowRead = await readChunkValues(
    metadataCollection,
    DUPLICATE_METADATA_CHUNK_KIND.ROW_FINGERPRINTS,
    rowChunkCount,
  );

  if (!rowRead.ok) {
    return INCOMPLETE_CHUNKED_READ_RESULT(rowChunkCount, invoiceChunkCount);
  }

  const invoiceRead = await readChunkValues(
    metadataCollection,
    DUPLICATE_METADATA_CHUNK_KIND.INVOICE_NUMBERS,
    invoiceChunkCount,
  );

  if (!invoiceRead.ok) {
    return INCOMPLETE_CHUNKED_READ_RESULT(rowChunkCount, invoiceChunkCount);
  }

  return {
    invoiceNumbers: invoiceRead.values,
    rowFingerprints: rowRead.values,
    storage: DUPLICATE_METADATA_STORAGE.CHUNKED,
    complete: true,
    rowChunkCount,
    invoiceChunkCount,
  };
}

/** Sequential chunk read — parity oracle for tests only. */
export async function readChunksSequentialForTests(
  orgId: string,
  importId: string,
  expected: {
    storage: DuplicateMetadataStorage | undefined;
    complete: boolean | undefined;
    rowChunkCount: number | undefined;
    invoiceChunkCount: number | undefined;
    inlineInvoiceNumbers: readonly string[];
    inlineRowFingerprints: readonly string[];
  },
): Promise<ImportDuplicateMetadataReadResult> {
  const storage = expected.storage ?? DUPLICATE_METADATA_STORAGE.INLINE;

  if (storage !== DUPLICATE_METADATA_STORAGE.CHUNKED) {
    return {
      invoiceNumbers: [...expected.inlineInvoiceNumbers],
      rowFingerprints: [...expected.inlineRowFingerprints],
      storage: DUPLICATE_METADATA_STORAGE.INLINE,
      complete: true,
      rowChunkCount: 0,
      invoiceChunkCount: 0,
    };
  }

  return readChunkedDuplicateMetadata(orgId, importId, {
    rowChunkCount: expected.rowChunkCount ?? 0,
    invoiceChunkCount: expected.invoiceChunkCount ?? 0,
    complete: expected.complete === true,
  }, readChunkValuesSequential);
}

export const importHistoryDuplicateMetadataRepository = {
  expectedRowChunkCount(rowFingerprintCount: number): number {
    return expectedChunkCount(rowFingerprintCount, DUPLICATE_METADATA_ROW_FINGERPRINTS_PER_CHUNK);
  },

  expectedInvoiceChunkCount(invoiceCount: number): number {
    return expectedChunkCount(invoiceCount, DUPLICATE_METADATA_INVOICE_NUMBERS_PER_CHUNK);
  },

  async writeChunks(
    orgId: string,
    userId: string,
    importId: string,
    input: ImportDuplicateMetadataWriteInput,
  ): Promise<ImportDuplicateMetadataWriteResult> {
    if (!shouldChunkDuplicateMetadata(input.rowFingerprints.length)) {
      return {
        storage: DUPLICATE_METADATA_STORAGE.INLINE,
        rowChunkCount: 0,
        invoiceChunkCount: 0,
        complete: true,
      };
    }

    const now = Timestamp.now();
    const rowChunks = chunkValues(input.rowFingerprints, DUPLICATE_METADATA_ROW_FINGERPRINTS_PER_CHUNK);
    const invoiceChunks = chunkValues(input.invoiceNumbers, DUPLICATE_METADATA_INVOICE_NUMBERS_PER_CHUNK);
    const metadataCollection = duplicateMetadataCollection(orgId, importId);
    const writes: Array<{ ref: DocumentReference; data: ImportDuplicateMetadataChunkDocument }> = [];

    for (let chunkIndex = 0; chunkIndex < rowChunks.length; chunkIndex += 1) {
      writes.push({
        ref: metadataCollection.doc(chunkDocId(DUPLICATE_METADATA_CHUNK_KIND.ROW_FINGERPRINTS, chunkIndex)),
        data: {
          organizationId: orgId,
          importId,
          kind: DUPLICATE_METADATA_CHUNK_KIND.ROW_FINGERPRINTS,
          chunkIndex,
          values: [...rowChunks[chunkIndex]!],
          createdAt: now,
          createdBy: userId,
        },
      });
    }

    for (let chunkIndex = 0; chunkIndex < invoiceChunks.length; chunkIndex += 1) {
      writes.push({
        ref: metadataCollection.doc(chunkDocId(DUPLICATE_METADATA_CHUNK_KIND.INVOICE_NUMBERS, chunkIndex)),
        data: {
          organizationId: orgId,
          importId,
          kind: DUPLICATE_METADATA_CHUNK_KIND.INVOICE_NUMBERS,
          chunkIndex,
          values: [...invoiceChunks[chunkIndex]!],
          createdAt: now,
          createdBy: userId,
        },
      });
    }

    await commitChunkWrites(writes);

    return {
      storage: DUPLICATE_METADATA_STORAGE.CHUNKED,
      rowChunkCount: rowChunks.length,
      invoiceChunkCount: invoiceChunks.length,
      complete: true,
    };
  },

  async markIncomplete(
    orgId: string,
    importId: string,
    userId: string,
    counts: { rowChunkCount: number; invoiceChunkCount: number },
  ): Promise<void> {
    const ref = getOrgCollection(orgId, COLLECTION).doc(importId);
    const now = Timestamp.now();

    await ref.update({
      duplicateMetadataStorage: DUPLICATE_METADATA_STORAGE.CHUNKED,
      duplicateMetadataComplete: false,
      duplicateMetadataRowChunkCount: counts.rowChunkCount,
      duplicateMetadataInvoiceChunkCount: counts.invoiceChunkCount,
      updatedAt: now,
      updatedBy: userId,
    });
  },

  async markComplete(
    orgId: string,
    importId: string,
    userId: string,
    counts: { rowChunkCount: number; invoiceChunkCount: number },
  ): Promise<void> {
    const ref = getOrgCollection(orgId, COLLECTION).doc(importId);
    const now = Timestamp.now();

    await ref.update({
      duplicateMetadataStorage: DUPLICATE_METADATA_STORAGE.CHUNKED,
      duplicateMetadataComplete: true,
      duplicateMetadataRowChunkCount: counts.rowChunkCount,
      duplicateMetadataInvoiceChunkCount: counts.invoiceChunkCount,
      updatedAt: now,
      updatedBy: userId,
    });
  },

  async readChunks(
    orgId: string,
    importId: string,
    expected: {
      storage: DuplicateMetadataStorage | undefined;
      complete: boolean | undefined;
      rowChunkCount: number | undefined;
      invoiceChunkCount: number | undefined;
      inlineInvoiceNumbers: readonly string[];
      inlineRowFingerprints: readonly string[];
    },
  ): Promise<ImportDuplicateMetadataReadResult> {
    const storage = expected.storage ?? DUPLICATE_METADATA_STORAGE.INLINE;

    if (storage !== DUPLICATE_METADATA_STORAGE.CHUNKED) {
      return {
        invoiceNumbers: [...expected.inlineInvoiceNumbers],
        rowFingerprints: [...expected.inlineRowFingerprints],
        storage: DUPLICATE_METADATA_STORAGE.INLINE,
        complete: true,
        rowChunkCount: 0,
        invoiceChunkCount: 0,
      };
    }

    return readChunkedDuplicateMetadata(orgId, importId, {
      rowChunkCount: expected.rowChunkCount ?? 0,
      invoiceChunkCount: expected.invoiceChunkCount ?? 0,
      complete: expected.complete === true,
    }, readChunkValuesParallel);
  },

  async hasAnyIncomplete(orgId: string): Promise<boolean> {
    const snapshot = await getOrgCollection(orgId, COLLECTION)
      .where('duplicateMetadataComplete', '==', false)
      .limit(25)
      .get();

    return snapshot.docs.some((doc) => {
      const data = doc.data() as {
        deletedAt: unknown;
        duplicateMetadataStorage?: string;
      };

      return (
        data.deletedAt == null &&
        data.duplicateMetadataStorage === DUPLICATE_METADATA_STORAGE.CHUNKED
      );
    });
  },
};
