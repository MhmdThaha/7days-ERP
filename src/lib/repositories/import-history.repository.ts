import 'server-only';

import { createHash } from 'node:crypto';

import { FieldValue, Timestamp, type Transaction } from 'firebase-admin/firestore';

import { IMPORT_HISTORY_STATUS, type ImportHistoryRecord, type ImportHistoryStatus } from '@/lib/import/duplicate';
import { buildDuplicateImportFileFingerprint } from '@/lib/import/duplicate/duplicate-import.service';
import { DUPLICATE_METADATA_STORAGE } from '@/lib/import/duplicate/import-history-duplicate-metadata.types';
import { IMPORT_DUPLICATE_INDEX_STATUS } from '@/lib/import/duplicate/import-index-health.types';
import type { ImportDuplicateIndexStatus } from '@/lib/import/duplicate/import-index-health.types';
import type { DuplicateMetadataStorage } from '@/lib/import/duplicate/import-history-duplicate-metadata.types';
import type { CreateImportHistoryInput } from '@/lib/import/execution/sales-import-execution.types';
import type { ImportExecutionStatus } from '@/lib/import/execution/sales-import-execution.types';
import { IMPORT_EXECUTION_STATUS } from '@/lib/import/execution/sales-import-execution.types';
import { buildAuditFields, getFirestore, getOrgCollection } from '@/lib/repositories/base.repository';
import {
  importHistoryDuplicateMetadataRepository,
  shouldChunkDuplicateMetadata,
} from '@/lib/repositories/import-history-duplicate-metadata.repository';

const COLLECTION = 'importHistory';
const FILE_LOCK_COLLECTION = 'importFileLocks';
const SOURCE_SALES_COLLECTION = 'sourceSales';

type ImportHistoryDocument = {
  organizationId: string;
  reportType: string;
  rowCount: number;
  rowsImported: number;
  rowsSkipped: number;
  rowsFailed: number;
  fileFingerprint: string;
  invoiceNumbers: string[];
  rowFingerprints: string[];
  saleIds: string[];
  executionStatus: string;
  status: string;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  deletedAt: Timestamp | null;
  deletedBy: string | null;
  duplicateIndexStatus?: ImportDuplicateIndexStatus;
  duplicateMetadataStorage?: DuplicateMetadataStorage;
  duplicateMetadataComplete?: boolean;
  duplicateMetadataRowChunkCount?: number;
  duplicateMetadataInvoiceChunkCount?: number;
};

type SourceSaleLinkDocument = {
  groupKey: string;
  saleId: string;
  createdAt: Timestamp;
  createdBy: string;
};

export type ImportHistoryDetail = ImportHistoryRecord & {
  rowsImported: number;
  rowsSkipped: number;
  rowsFailed: number;
  saleIds: readonly string[];
  executionStatus: ImportExecutionStatus;
};

export type BeginOrResumeImportInput = {
  reportType: string;
  rowCount: number;
  fileFingerprint: string;
  invoiceNumbers: readonly string[];
  rowFingerprints: readonly string[];
  /** Resume a specific in-progress import (crash recovery). Bypasses the primary file lock. */
  resumeImportId?: string;
  /**
   * Start a new import session when the primary file lock points to a completed import.
   * Creates a session-scoped lock; the original fingerprint lock is left unchanged.
   */
  forceNewSession?: boolean;
};

export type BeginOrResumeImportResult = {
  history: ImportHistoryDetail;
  resumed: boolean;
  alreadyCompleted: boolean;
};

export function hashImportIdentity(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function sourceSaleLinkRef(orgId: string, importId: string, groupKey: string) {
  return getOrgCollection(orgId, COLLECTION)
    .doc(importId)
    .collection(SOURCE_SALES_COLLECTION)
    .doc(hashImportIdentity(groupKey));
}

function resolveStoredFileFingerprint(
  storedFingerprint: string,
  rowFingerprints: readonly string[],
): string {
  if (storedFingerprint !== '') {
    return storedFingerprint;
  }

  return buildDuplicateImportFileFingerprint(rowFingerprints);
}

function isLegacyInlineDuplicateMetadata(data: ImportHistoryDocument): boolean {
  return (
    data.duplicateMetadataStorage !== DUPLICATE_METADATA_STORAGE.CHUNKED &&
    (data.invoiceNumbers.length > 0 || data.rowFingerprints.length > 0)
  );
}

function duplicateMetadataFieldsFromDocument(data: ImportHistoryDocument) {
  if (isLegacyInlineDuplicateMetadata(data)) {
    return {
      duplicateMetadataStorage: DUPLICATE_METADATA_STORAGE.INLINE as DuplicateMetadataStorage,
      duplicateMetadataComplete: true,
      duplicateMetadataRowChunkCount: 0,
      duplicateMetadataInvoiceChunkCount: 0,
    };
  }

  return {
    duplicateMetadataStorage: data.duplicateMetadataStorage,
    duplicateMetadataComplete: data.duplicateMetadataComplete ?? data.duplicateMetadataStorage !== DUPLICATE_METADATA_STORAGE.CHUNKED,
    duplicateMetadataRowChunkCount: data.duplicateMetadataRowChunkCount ?? 0,
    duplicateMetadataInvoiceChunkCount: data.duplicateMetadataInvoiceChunkCount ?? 0,
  };
}

async function hydrateDuplicateMetadata(
  orgId: string,
  importId: string,
  data: ImportHistoryDocument,
): Promise<Pick<ImportHistoryRecord, 'invoiceNumbers' | 'rowFingerprints' | 'duplicateMetadataStorage' | 'duplicateMetadataComplete' | 'duplicateMetadataRowChunkCount' | 'duplicateMetadataInvoiceChunkCount'>> {
  const metadataFields = duplicateMetadataFieldsFromDocument(data);
  const readResult = await importHistoryDuplicateMetadataRepository.readChunks(orgId, importId, {
    storage: metadataFields.duplicateMetadataStorage,
    complete: metadataFields.duplicateMetadataComplete,
    rowChunkCount: metadataFields.duplicateMetadataRowChunkCount,
    invoiceChunkCount: metadataFields.duplicateMetadataInvoiceChunkCount,
    inlineInvoiceNumbers: data.invoiceNumbers,
    inlineRowFingerprints: data.rowFingerprints,
  });

  return {
    invoiceNumbers: readResult.invoiceNumbers,
    rowFingerprints: readResult.rowFingerprints,
    duplicateMetadataStorage: readResult.storage,
    duplicateMetadataComplete: readResult.complete,
    duplicateMetadataRowChunkCount: readResult.rowChunkCount,
    duplicateMetadataInvoiceChunkCount: readResult.invoiceChunkCount,
  };
}

async function documentToImportHistoryRecord(
  orgId: string,
  id: string,
  data: ImportHistoryDocument,
): Promise<ImportHistoryRecord> {
  const duplicateMetadata = await hydrateDuplicateMetadata(orgId, id, data);

  return {
    importId: id,
    importedAt: data.createdAt.toDate().toISOString(),
    importedBy: data.createdBy,
    reportType: data.reportType,
    rowCount: data.rowCount,
    fileFingerprint: resolveStoredFileFingerprint(data.fileFingerprint, duplicateMetadata.rowFingerprints),
    invoiceNumbers: duplicateMetadata.invoiceNumbers,
    rowFingerprints: duplicateMetadata.rowFingerprints,
    status: data.status as ImportHistoryRecord['status'],
    duplicateIndexStatus: data.duplicateIndexStatus ?? IMPORT_DUPLICATE_INDEX_STATUS.PENDING,
    duplicateMetadataStorage: duplicateMetadata.duplicateMetadataStorage,
    duplicateMetadataComplete: duplicateMetadata.duplicateMetadataComplete,
    duplicateMetadataRowChunkCount: duplicateMetadata.duplicateMetadataRowChunkCount,
    duplicateMetadataInvoiceChunkCount: duplicateMetadata.duplicateMetadataInvoiceChunkCount,
  };
}

async function documentToImportHistoryDetail(
  orgId: string,
  id: string,
  data: ImportHistoryDocument,
): Promise<ImportHistoryDetail> {
  const record = await documentToImportHistoryRecord(orgId, id, data);

  return {
    ...record,
    rowsImported: data.rowsImported,
    rowsSkipped: data.rowsSkipped,
    rowsFailed: data.rowsFailed,
    saleIds: data.saleIds,
    executionStatus: data.executionStatus as ImportExecutionStatus,
  };
}

function buildNewHistoryDocument(
  orgId: string,
  userId: string,
  input: BeginOrResumeImportInput,
  now: Timestamp,
): ImportHistoryDocument {
  const useChunkedStorage = shouldChunkDuplicateMetadata(input.rowFingerprints.length);

  return {
    organizationId: orgId,
    reportType: input.reportType,
    rowCount: input.rowCount,
    rowsImported: 0,
    rowsSkipped: 0,
    rowsFailed: 0,
    fileFingerprint: useChunkedStorage ? '' : input.fileFingerprint,
    invoiceNumbers: useChunkedStorage ? [] : [...input.invoiceNumbers],
    rowFingerprints: useChunkedStorage ? [] : [...input.rowFingerprints],
    saleIds: [],
    executionStatus: IMPORT_EXECUTION_STATUS.IMPORTED,
    status: IMPORT_HISTORY_STATUS.IMPORTING,
    createdAt: now,
    createdBy: userId,
    updatedAt: now,
    updatedBy: userId,
    deletedAt: null,
    deletedBy: null,
    duplicateIndexStatus: IMPORT_DUPLICATE_INDEX_STATUS.PENDING,
    duplicateMetadataStorage: useChunkedStorage ? DUPLICATE_METADATA_STORAGE.CHUNKED : DUPLICATE_METADATA_STORAGE.INLINE,
    duplicateMetadataComplete: !useChunkedStorage,
    duplicateMetadataRowChunkCount: useChunkedStorage
      ? importHistoryDuplicateMetadataRepository.expectedRowChunkCount(input.rowFingerprints.length)
      : 0,
    duplicateMetadataInvoiceChunkCount: useChunkedStorage
      ? importHistoryDuplicateMetadataRepository.expectedInvoiceChunkCount(input.invoiceNumbers.length)
      : 0,
  };
}

async function persistDuplicateMetadataForImport(
  orgId: string,
  userId: string,
  importId: string,
  input: Pick<BeginOrResumeImportInput, 'invoiceNumbers' | 'rowFingerprints'>,
  data: ImportHistoryDocument,
): Promise<void> {
  if (!shouldChunkDuplicateMetadata(input.rowFingerprints.length)) {
    return;
  }

  const expectedRowChunks = importHistoryDuplicateMetadataRepository.expectedRowChunkCount(
    input.rowFingerprints.length,
  );
  const expectedInvoiceChunks = importHistoryDuplicateMetadataRepository.expectedInvoiceChunkCount(
    input.invoiceNumbers.length,
  );

  await importHistoryDuplicateMetadataRepository.markIncomplete(orgId, importId, userId, {
    rowChunkCount: expectedRowChunks,
    invoiceChunkCount: expectedInvoiceChunks,
  });

  await importHistoryDuplicateMetadataRepository.writeChunks(orgId, userId, importId, {
    invoiceNumbers: input.invoiceNumbers,
    rowFingerprints: input.rowFingerprints,
  });

  await importHistoryDuplicateMetadataRepository.markComplete(orgId, importId, userId, {
    rowChunkCount: expectedRowChunks,
    invoiceChunkCount: expectedInvoiceChunks,
  });
}

async function ensureDuplicateMetadataCompleteOnResume(
  orgId: string,
  userId: string,
  importId: string,
  input: Pick<BeginOrResumeImportInput, 'invoiceNumbers' | 'rowFingerprints'>,
  data: ImportHistoryDocument,
): Promise<void> {
  const metadataFields = duplicateMetadataFieldsFromDocument(data);

  if (
    metadataFields.duplicateMetadataStorage === DUPLICATE_METADATA_STORAGE.CHUNKED &&
    metadataFields.duplicateMetadataComplete === false
  ) {
    await persistDuplicateMetadataForImport(orgId, userId, importId, input, data);
  }
}

export const importHistoryRepository = {
  sourceSaleLinkRef,

  writeSourceSaleLinkInTransaction(
    transaction: Transaction,
    orgId: string,
    importId: string,
    groupKey: string,
    saleId: string,
    userId: string,
  ): void {
    const now = Timestamp.now();
    const linkRef = sourceSaleLinkRef(orgId, importId, groupKey);
    const historyRef = getOrgCollection(orgId, COLLECTION).doc(importId);
    const document: SourceSaleLinkDocument = {
      groupKey,
      saleId,
      createdAt: now,
      createdBy: userId,
    };

    transaction.set(linkRef, document);
    transaction.update(historyRef, {
      saleIds: FieldValue.arrayUnion(saleId),
      updatedAt: now,
      updatedBy: userId,
    });
  },

  async listSourceSales(orgId: string, importId: string): Promise<Map<string, string>> {
    const snapshot = await getOrgCollection(orgId, COLLECTION)
      .doc(importId)
      .collection(SOURCE_SALES_COLLECTION)
      .get();
    const links = new Map<string, string>();

    for (const doc of snapshot.docs) {
      const data = doc.data() as SourceSaleLinkDocument;

      if (data.groupKey && data.saleId) {
        links.set(data.groupKey, data.saleId);
      }
    }

    return links;
  },

  async hasIncompleteDuplicateMetadata(orgId: string): Promise<boolean> {
    return importHistoryDuplicateMetadataRepository.hasAnyIncomplete(orgId);
  },

  async beginOrResume(
    orgId: string,
    userId: string,
    input: BeginOrResumeImportInput,
  ): Promise<BeginOrResumeImportResult> {
    const firestore = getFirestore();
    const historyCollection = getOrgCollection(orgId, COLLECTION);
    const fingerprint = input.fileFingerprint;
    const fingerprintHash = fingerprint === '' ? null : hashImportIdentity(fingerprint);

    const transactionResult = await firestore.runTransaction(async (transaction) => {
      const now = Timestamp.now();

      if (input.resumeImportId) {
        const historyRef = historyCollection.doc(input.resumeImportId);
        const historySnap = await transaction.get(historyRef);

        if (historySnap.exists) {
          const data = historySnap.data() as ImportHistoryDocument;

          if (!data.deletedAt && data.organizationId === orgId) {
            const alreadyCompleted = data.status === IMPORT_HISTORY_STATUS.COMPLETED;

            return {
              importId: input.resumeImportId,
              data,
              resumed: true,
              alreadyCompleted,
              isNew: false,
            };
          }
        }
      }

      if (fingerprintHash && input.forceNewSession) {
        const historyRef = historyCollection.doc();
        const document = buildNewHistoryDocument(orgId, userId, input, now);
        transaction.set(historyRef, document);

        const sessionLockRef = getOrgCollection(orgId, FILE_LOCK_COLLECTION).doc(historyRef.id);
        transaction.set(sessionLockRef, {
          importId: historyRef.id,
          fileFingerprintHash: fingerprintHash,
          organizationId: orgId,
          sessionScope: 'forced-reimport',
          createdAt: now,
          createdBy: userId,
        });

        return {
          importId: historyRef.id,
          data: document,
          resumed: false,
          alreadyCompleted: false,
          isNew: true,
        };
      }

      if (fingerprintHash) {
        const lockRef = getOrgCollection(orgId, FILE_LOCK_COLLECTION).doc(fingerprintHash);
        const lockSnap = await transaction.get(lockRef);

        if (lockSnap.exists) {
          const importId = String(lockSnap.data()?.importId ?? '');
          const historyRef = historyCollection.doc(importId);
          const historySnap = await transaction.get(historyRef);

          if (historySnap.exists) {
            const data = historySnap.data() as ImportHistoryDocument;

            if (!data.deletedAt) {
              const alreadyCompleted = data.status === IMPORT_HISTORY_STATUS.COMPLETED;

              return {
                importId,
                data,
                resumed: true,
                alreadyCompleted,
                isNew: false,
              };
            }
          }
        }

        const historyRef = historyCollection.doc();
        const document = buildNewHistoryDocument(orgId, userId, input, now);
        transaction.set(historyRef, document);
        transaction.set(lockRef, {
          importId: historyRef.id,
          fileFingerprintHash: fingerprintHash,
          organizationId: orgId,
          createdAt: now,
          createdBy: userId,
        });

        return {
          importId: historyRef.id,
          data: document,
          resumed: false,
          alreadyCompleted: false,
          isNew: true,
        };
      }

      const historyRef = historyCollection.doc();
      const document = buildNewHistoryDocument(orgId, userId, input, now);
      transaction.set(historyRef, document);

      return {
        importId: historyRef.id,
        data: document,
        resumed: false,
        alreadyCompleted: false,
        isNew: true,
      };
    });

    if (transactionResult.isNew) {
      await persistDuplicateMetadataForImport(
        orgId,
        userId,
        transactionResult.importId,
        input,
        transactionResult.data,
      );
    } else if (transactionResult.resumed) {
      await ensureDuplicateMetadataCompleteOnResume(
        orgId,
        userId,
        transactionResult.importId,
        input,
        transactionResult.data,
      );
    }

    const history = await documentToImportHistoryDetail(
      orgId,
      transactionResult.importId,
      (
        await getOrgCollection(orgId, COLLECTION).doc(transactionResult.importId).get()
      ).data() as ImportHistoryDocument,
    );

    return {
      history,
      resumed: transactionResult.resumed,
      alreadyCompleted: transactionResult.alreadyCompleted,
    };
  },

  async create(
    orgId: string,
    userId: string,
    input: CreateImportHistoryInput,
  ): Promise<ImportHistoryRecord> {
    const ref = getOrgCollection(orgId, COLLECTION).doc();
    const now = Timestamp.now();
    const useChunkedStorage = shouldChunkDuplicateMetadata(input.rowFingerprints.length);

    const document = {
      organizationId: orgId,
      reportType: input.reportType,
      rowCount: input.rowCount,
      rowsImported: input.rowsImported,
      rowsSkipped: input.rowsSkipped,
      rowsFailed: input.rowsFailed,
      fileFingerprint: useChunkedStorage ? '' : input.fileFingerprint,
      invoiceNumbers: useChunkedStorage ? [] : [...input.invoiceNumbers],
      rowFingerprints: useChunkedStorage ? [] : [...input.rowFingerprints],
      saleIds: [...input.saleIds],
      executionStatus: input.executionStatus,
      status: input.lifecycleStatus,
      createdAt: now,
      createdBy: userId,
      updatedAt: now,
      updatedBy: userId,
      deletedAt: null,
      deletedBy: null,
      duplicateMetadataStorage: useChunkedStorage ? DUPLICATE_METADATA_STORAGE.CHUNKED : DUPLICATE_METADATA_STORAGE.INLINE,
      duplicateMetadataComplete: !useChunkedStorage,
      duplicateMetadataRowChunkCount: useChunkedStorage
        ? importHistoryDuplicateMetadataRepository.expectedRowChunkCount(input.rowFingerprints.length)
        : 0,
      duplicateMetadataInvoiceChunkCount: useChunkedStorage
        ? importHistoryDuplicateMetadataRepository.expectedInvoiceChunkCount(input.invoiceNumbers.length)
        : 0,
    } satisfies ImportHistoryDocument;

    await ref.set(document);

    if (useChunkedStorage) {
      await persistDuplicateMetadataForImport(orgId, userId, ref.id, input, document);
    }

    return documentToImportHistoryRecord(orgId, ref.id, document);
  },

  async hasAny(orgId: string): Promise<boolean> {
    const snapshot = await getOrgCollection(orgId, COLLECTION)
      .where('deletedAt', '==', null)
      .limit(1)
      .get();

    return !snapshot.empty;
  },

  async list(orgId: string): Promise<ImportHistoryRecord[]> {
    const snapshot = await getOrgCollection(orgId, COLLECTION)
      .where('deletedAt', '==', null)
      .get();

    const records = await Promise.all(
      snapshot.docs.map((doc) =>
        documentToImportHistoryRecord(orgId, doc.id, doc.data() as ImportHistoryDocument),
      ),
    );

    return records.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  },

  async getById(orgId: string, importId: string): Promise<ImportHistoryDetail | null> {
    const snapshot = await getOrgCollection(orgId, COLLECTION).doc(importId).get();

    if (!snapshot.exists) {
      return null;
    }

    const data = snapshot.data() as ImportHistoryDocument;

    if (data.deletedAt) {
      return null;
    }

    return documentToImportHistoryDetail(orgId, snapshot.id, data);
  },

  async updateLifecycle(
    orgId: string,
    importId: string,
    userId: string,
    update: {
      status: ImportHistoryStatus;
      executionStatus?: ImportExecutionStatus;
      rowsImported?: number;
      rowsSkipped?: number;
      rowsFailed?: number;
    },
  ): Promise<ImportHistoryDetail> {
    const ref = getOrgCollection(orgId, COLLECTION).doc(importId);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      throw new Error(`Import history ${importId} was not found`);
    }

    const data = snapshot.data() as ImportHistoryDocument;

    if (data.deletedAt) {
      throw new Error(`Import history ${importId} was not found`);
    }

    const audit = buildAuditFields(userId, false);
    const nextDocument: ImportHistoryDocument = {
      ...data,
      status: update.status,
      executionStatus: update.executionStatus ?? data.executionStatus,
      rowsImported: update.rowsImported ?? data.rowsImported,
      rowsSkipped: update.rowsSkipped ?? data.rowsSkipped,
      rowsFailed: update.rowsFailed ?? data.rowsFailed,
      updatedAt: audit.updatedAt,
      updatedBy: audit.updatedBy,
    };

    await ref.update({
      status: nextDocument.status,
      executionStatus: nextDocument.executionStatus,
      rowsImported: nextDocument.rowsImported,
      rowsSkipped: nextDocument.rowsSkipped,
      rowsFailed: nextDocument.rowsFailed,
      updatedAt: nextDocument.updatedAt,
      updatedBy: nextDocument.updatedBy,
    });

    return documentToImportHistoryDetail(orgId, importId, nextDocument);
  },
};
