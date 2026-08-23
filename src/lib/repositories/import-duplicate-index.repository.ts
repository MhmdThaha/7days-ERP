import 'server-only';

import { Timestamp, type DocumentReference } from 'firebase-admin/firestore';

import type {
  IndexImportDuplicateHitsInput,
  IndexImportDuplicateHitsResult,
} from '@/lib/import/duplicate/import-duplicate-index.types';
import { getFirestore, getOrgCollection } from '@/lib/repositories/base.repository';
import { hashImportIdentity } from '@/lib/repositories/import-history.repository';

const INVOICE_INDEX_COLLECTION = 'importDuplicateInvoices';
const ROW_INDEX_COLLECTION = 'importDuplicateRows';
const HITS_SUBCOLLECTION = 'hits';

/** Firestore batch limit is 500 operations; stay below for headroom. */
export const IMPORT_DUPLICATE_INDEX_MAX_BATCH_WRITES = 450;

type PendingWrite = {
  ref: DocumentReference;
  data: Record<string, unknown>;
};

type InvoiceHitKey = {
  invoiceNormalized: string;
  invoiceHash: string;
};

type RowHitKey = {
  fingerprintHash: string;
};

function invoiceHitRef(orgId: string, invoiceHash: string, importId: string) {
  return getOrgCollection(orgId, INVOICE_INDEX_COLLECTION)
    .doc(invoiceHash)
    .collection(HITS_SUBCOLLECTION)
    .doc(importId);
}

function rowHitRef(orgId: string, fingerprintHash: string, importId: string) {
  return getOrgCollection(orgId, ROW_INDEX_COLLECTION)
    .doc(fingerprintHash)
    .collection(HITS_SUBCOLLECTION)
    .doc(importId);
}

/** Matches duplicate-import invoice normalization: trim + uppercase. */
export function normalizeInvoiceForDuplicateIndex(invoice: string): string | null {
  const trimmed = invoice.trim().toUpperCase();

  return trimmed === '' ? null : trimmed;
}

export function uniqueInvoiceIndexHits(
  invoiceNumbers: readonly string[],
): readonly InvoiceHitKey[] {
  const seen = new Set<string>();
  const hits: InvoiceHitKey[] = [];

  for (const invoice of invoiceNumbers) {
    const normalized = normalizeInvoiceForDuplicateIndex(invoice);

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    hits.push({
      invoiceNormalized: normalized,
      invoiceHash: hashImportIdentity(normalized),
    });
  }

  return hits;
}

export function uniqueRowIndexHits(
  rowFingerprints: readonly string[],
): readonly RowHitKey[] {
  const seen = new Set<string>();
  const hits: RowHitKey[] = [];

  for (const fingerprint of rowFingerprints) {
    if (!fingerprint || seen.has(fingerprint)) {
      continue;
    }

    seen.add(fingerprint);
    hits.push({ fingerprintHash: hashImportIdentity(fingerprint) });
  }

  return hits;
}

async function commitBatchedWrites(writes: readonly PendingWrite[]): Promise<number> {
  if (writes.length === 0) {
    return 0;
  }

  const firestore = getFirestore();
  let batchesCommitted = 0;

  for (let offset = 0; offset < writes.length; offset += IMPORT_DUPLICATE_INDEX_MAX_BATCH_WRITES) {
    const chunk = writes.slice(offset, offset + IMPORT_DUPLICATE_INDEX_MAX_BATCH_WRITES);
    const batch = firestore.batch();

    for (const write of chunk) {
      batch.set(write.ref, write.data, { merge: true });
    }

    await batch.commit();
    batchesCommitted += 1;
  }

  return batchesCommitted;
}

export const importDuplicateIndexRepository = {
  /**
   * Write-only Phase 4A index maintenance.
   * Idempotent per (hash, importId). Safe to call on create and resume (repair).
   * Never throws — import execution must not depend on index success.
   */
  async indexImportDuplicateHits(
    orgId: string,
    userId: string,
    input: IndexImportDuplicateHitsInput,
  ): Promise<IndexImportDuplicateHitsResult> {
    const invoiceHits = uniqueInvoiceIndexHits(input.invoiceNumbers);
    const rowHits = uniqueRowIndexHits(input.rowFingerprints);
    const now = Timestamp.now();
    const writes: PendingWrite[] = [];

    for (const hit of invoiceHits) {
      writes.push({
        ref: invoiceHitRef(orgId, hit.invoiceHash, input.importId),
        data: {
          organizationId: orgId,
          importId: input.importId,
          invoiceNormalized: hit.invoiceNormalized,
          invoiceHash: hit.invoiceHash,
          status: input.status,
          indexedAt: now,
          createdBy: userId,
        },
      });
    }

    for (const hit of rowHits) {
      writes.push({
        ref: rowHitRef(orgId, hit.fingerprintHash, input.importId),
        data: {
          organizationId: orgId,
          importId: input.importId,
          fingerprintHash: hit.fingerprintHash,
          status: input.status,
          indexedAt: now,
          createdBy: userId,
        },
      });
    }

    try {
      const batchesCommitted = await commitBatchedWrites(writes);

      return {
        success: true,
        invoiceHitsWritten: invoiceHits.length,
        rowHitsWritten: rowHits.length,
        batchesCommitted,
      };
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[import-duplicate-index] failed to index import duplicate hits', {
          orgId,
          importId: input.importId,
          error,
        });
      }

      return {
        success: false,
        invoiceHitsWritten: 0,
        rowHitsWritten: 0,
        batchesCommitted: 0,
      };
    }
  },
};
