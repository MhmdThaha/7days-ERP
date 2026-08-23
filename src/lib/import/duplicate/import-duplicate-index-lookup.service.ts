import 'server-only';

import type { DuplicateImportFingerprints } from '@/lib/import/duplicate/duplicate-import.types';
import { getFirestore, getOrgCollection } from '@/lib/repositories/base.repository';
import {
  uniqueInvoiceIndexHits,
  uniqueRowIndexHits,
} from '@/lib/repositories/import-duplicate-index.repository';

const HITS_SUBCOLLECTION = 'hits';

/** Firestore `in` / disjunction limit for Admin SDK queries. */
export const IMPORT_DUPLICATE_INDEX_IN_QUERY_MAX = 30;

/** Max concurrent batched index queries per import operation. */
export const IMPORT_DUPLICATE_INDEX_LOOKUP_CONCURRENCY = 8;

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

async function lookupImportIdsByInvoiceHashBatches(
  orgId: string,
  invoiceHashes: readonly string[],
): Promise<{ importIds: Set<string>; queryCount: number }> {
  const importIds = new Set<string>();
  const batches = chunkValues(invoiceHashes, IMPORT_DUPLICATE_INDEX_IN_QUERY_MAX);

  if (batches.length === 0) {
    return { importIds, queryCount: 0 };
  }

  const batchResults = await mapWithConcurrency(
    batches,
    IMPORT_DUPLICATE_INDEX_LOOKUP_CONCURRENCY,
    async (batch) => {
      const snapshot = await getFirestore()
        .collectionGroup(HITS_SUBCOLLECTION)
        .where('organizationId', '==', orgId)
        .where('invoiceHash', 'in', batch)
        .get();

      const ids = new Set<string>();

      for (const doc of snapshot.docs) {
        ids.add(doc.id);
      }

      return ids;
    },
  );

  for (const ids of batchResults) {
    for (const importId of ids) {
      importIds.add(importId);
    }
  }

  return { importIds, queryCount: batches.length };
}

async function lookupImportIdsByRowHashBatches(
  orgId: string,
  rowHashes: readonly string[],
): Promise<{ importIds: Set<string>; queryCount: number }> {
  const importIds = new Set<string>();
  const batches = chunkValues(rowHashes, IMPORT_DUPLICATE_INDEX_IN_QUERY_MAX);

  if (batches.length === 0) {
    return { importIds, queryCount: 0 };
  }

  const batchResults = await mapWithConcurrency(
    batches,
    IMPORT_DUPLICATE_INDEX_LOOKUP_CONCURRENCY,
    async (batch) => {
      const snapshot = await getFirestore()
        .collectionGroup(HITS_SUBCOLLECTION)
        .where('organizationId', '==', orgId)
        .where('fingerprintHash', 'in', batch)
        .get();

      const ids = new Set<string>();

      for (const doc of snapshot.docs) {
        ids.add(doc.id);
      }

      return ids;
    },
  );

  for (const ids of batchResults) {
    for (const importId of ids) {
      importIds.add(importId);
    }
  }

  return { importIds, queryCount: batches.length };
}

export function countBatchedIndexQueries(
  uniqueInvoiceHashCount: number,
  uniqueRowHashCount: number,
): number {
  return (
    Math.ceil(uniqueInvoiceHashCount / IMPORT_DUPLICATE_INDEX_IN_QUERY_MAX) +
    Math.ceil(uniqueRowHashCount / IMPORT_DUPLICATE_INDEX_IN_QUERY_MAX)
  );
}

/** Batched collection-group lookup — fewer Firestore round trips, same candidate IDs. */
export async function lookupCandidateImportIdsFromIndexBatched(
  orgId: string,
  fingerprints: DuplicateImportFingerprints,
): Promise<{ candidateIds: Set<string>; indexLookupCount: number }> {
  const invoiceHits = uniqueInvoiceIndexHits(fingerprints.invoiceNumbers);
  const rowHits = uniqueRowIndexHits(fingerprints.rowFingerprints);
  const invoiceHashes = invoiceHits.map((hit) => hit.invoiceHash);
  const rowHashes = rowHits.map((hit) => hit.fingerprintHash);

  const [invoiceResult, rowResult] = await Promise.all([
    lookupImportIdsByInvoiceHashBatches(orgId, invoiceHashes),
    lookupImportIdsByRowHashBatches(orgId, rowHashes),
  ]);

  const candidateIds = new Set<string>([...invoiceResult.importIds, ...rowResult.importIds]);

  return {
    candidateIds,
    indexLookupCount: invoiceResult.queryCount + rowResult.queryCount,
  };
}

/** Sequential per-hash lookup — test reference for batched parity only. */
export async function lookupCandidateImportIdsFromIndexSequential(
  orgId: string,
  fingerprints: DuplicateImportFingerprints,
): Promise<{ candidateIds: Set<string>; indexLookupCount: number }> {
  const INVOICE_INDEX_COLLECTION = 'importDuplicateInvoices';
  const ROW_INDEX_COLLECTION = 'importDuplicateRows';

  const candidateIds = new Set<string>();
  const invoiceHits = uniqueInvoiceIndexHits(fingerprints.invoiceNumbers);
  const rowHits = uniqueRowIndexHits(fingerprints.rowFingerprints);
  let indexLookupCount = 0;

  for (const hit of invoiceHits) {
    indexLookupCount += 1;
    const snapshot = await getOrgCollection(orgId, INVOICE_INDEX_COLLECTION)
      .doc(hit.invoiceHash)
      .collection(HITS_SUBCOLLECTION)
      .get();

    for (const doc of snapshot.docs) {
      candidateIds.add(doc.id);
    }
  }

  for (const hit of rowHits) {
    indexLookupCount += 1;
    const snapshot = await getOrgCollection(orgId, ROW_INDEX_COLLECTION)
      .doc(hit.fingerprintHash)
      .collection(HITS_SUBCOLLECTION)
      .get();

    for (const doc of snapshot.docs) {
      candidateIds.add(doc.id);
    }
  }

  return { candidateIds, indexLookupCount };
}
