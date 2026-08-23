import 'server-only';

import { getOrgCollection } from '@/lib/repositories/base.repository';
import {
  uniqueInvoiceIndexHits,
  uniqueRowIndexHits,
} from '@/lib/repositories/import-duplicate-index.repository';
import { hashImportIdentity } from '@/lib/repositories/import-history.repository';

const INVOICE_INDEX_COLLECTION = 'importDuplicateInvoices';
const ROW_INDEX_COLLECTION = 'importDuplicateRows';
const HITS_SUBCOLLECTION = 'hits';

/** Verify every expected invoice and row hit exists for an import. */
export async function verifyImportDuplicateIndexHits(
  orgId: string,
  importId: string,
  invoiceNumbers: readonly string[],
  rowFingerprints: readonly string[],
): Promise<boolean> {
  const invoiceHits = uniqueInvoiceIndexHits(invoiceNumbers);
  const rowHits = uniqueRowIndexHits(rowFingerprints);

  for (const hit of invoiceHits) {
    const snapshot = await getOrgCollection(orgId, INVOICE_INDEX_COLLECTION)
      .doc(hit.invoiceHash)
      .collection(HITS_SUBCOLLECTION)
      .doc(importId)
      .get();

    if (!snapshot.exists) {
      return false;
    }
  }

  for (const hit of rowHits) {
    const snapshot = await getOrgCollection(orgId, ROW_INDEX_COLLECTION)
      .doc(hit.fingerprintHash)
      .collection(HITS_SUBCOLLECTION)
      .doc(importId)
      .get();

    if (!snapshot.exists) {
      return false;
    }
  }

  return true;
}

/** Read primary exact-file lock importId when present. */
export async function lookupPrimaryFileLockImportId(
  orgId: string,
  fileFingerprint: string,
): Promise<string | null> {
  if (fileFingerprint === '') {
    return null;
  }

  const fingerprintHash = hashImportIdentity(fileFingerprint);
  const snapshot = await getOrgCollection(orgId, 'importFileLocks').doc(fingerprintHash).get();

  if (!snapshot.exists) {
    return null;
  }

  const importId = String(snapshot.data()?.importId ?? '');

  return importId === '' ? null : importId;
}
