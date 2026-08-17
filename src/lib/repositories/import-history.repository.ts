import 'server-only';

import { createHash } from 'node:crypto';

import { FieldValue, Timestamp, type Transaction } from 'firebase-admin/firestore';

import { IMPORT_HISTORY_STATUS, type ImportHistoryRecord, type ImportHistoryStatus } from '@/lib/import/duplicate';
import type { CreateImportHistoryInput } from '@/lib/import/execution/sales-import-execution.types';
import type { ImportExecutionStatus } from '@/lib/import/execution/sales-import-execution.types';
import { IMPORT_EXECUTION_STATUS } from '@/lib/import/execution/sales-import-execution.types';
import { buildAuditFields, getFirestore, getOrgCollection } from '@/lib/repositories/base.repository';

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

function toImportHistoryRecord(id: string, data: ImportHistoryDocument): ImportHistoryRecord {
  return {
    importId: id,
    importedAt: data.createdAt.toDate().toISOString(),
    importedBy: data.createdBy,
    reportType: data.reportType,
    rowCount: data.rowCount,
    fileFingerprint: data.fileFingerprint,
    invoiceNumbers: data.invoiceNumbers,
    rowFingerprints: data.rowFingerprints,
    status: data.status as ImportHistoryRecord['status'],
  };
}

function toImportHistoryDetail(id: string, data: ImportHistoryDocument): ImportHistoryDetail {
  return {
    ...toImportHistoryRecord(id, data),
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
  return {
    organizationId: orgId,
    reportType: input.reportType,
    rowCount: input.rowCount,
    rowsImported: 0,
    rowsSkipped: 0,
    rowsFailed: 0,
    fileFingerprint: input.fileFingerprint,
    invoiceNumbers: [...input.invoiceNumbers],
    rowFingerprints: [...input.rowFingerprints],
    saleIds: [],
    executionStatus: IMPORT_EXECUTION_STATUS.IMPORTED,
    status: IMPORT_HISTORY_STATUS.IMPORTING,
    createdAt: now,
    createdBy: userId,
    updatedAt: now,
    updatedBy: userId,
    deletedAt: null,
    deletedBy: null,
  };
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

  async beginOrResume(
    orgId: string,
    userId: string,
    input: BeginOrResumeImportInput,
  ): Promise<BeginOrResumeImportResult> {
    const firestore = getFirestore();
    const historyCollection = getOrgCollection(orgId, COLLECTION);
    const fingerprint = input.fileFingerprint;
    const fingerprintHash = fingerprint === '' ? null : hashImportIdentity(fingerprint);

    return firestore.runTransaction(async (transaction) => {
      const now = Timestamp.now();

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
              const history = toImportHistoryDetail(importId, data);
              const alreadyCompleted = history.status === IMPORT_HISTORY_STATUS.COMPLETED;

              return {
                history,
                resumed: true,
                alreadyCompleted,
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
          history: toImportHistoryDetail(historyRef.id, document),
          resumed: false,
          alreadyCompleted: false,
        };
      }

      const historyRef = historyCollection.doc();
      const document = buildNewHistoryDocument(orgId, userId, input, now);
      transaction.set(historyRef, document);

      return {
        history: toImportHistoryDetail(historyRef.id, document),
        resumed: false,
        alreadyCompleted: false,
      };
    });
  },

  async create(
    orgId: string,
    userId: string,
    input: CreateImportHistoryInput,
  ): Promise<ImportHistoryRecord> {
    const ref = getOrgCollection(orgId, COLLECTION).doc();
    const now = Timestamp.now();

    const document = {
      organizationId: orgId,
      reportType: input.reportType,
      rowCount: input.rowCount,
      rowsImported: input.rowsImported,
      rowsSkipped: input.rowsSkipped,
      rowsFailed: input.rowsFailed,
      fileFingerprint: input.fileFingerprint,
      invoiceNumbers: [...input.invoiceNumbers],
      rowFingerprints: [...input.rowFingerprints],
      saleIds: [...input.saleIds],
      executionStatus: input.executionStatus,
      status: input.lifecycleStatus,
      createdAt: now,
      createdBy: userId,
      updatedAt: now,
      updatedBy: userId,
      deletedAt: null,
      deletedBy: null,
    } satisfies ImportHistoryDocument;

    await ref.set(document);

    return toImportHistoryRecord(ref.id, document);
  },

  async list(orgId: string): Promise<ImportHistoryRecord[]> {
    const snapshot = await getOrgCollection(orgId, COLLECTION)
      .where('deletedAt', '==', null)
      .get();

    return snapshot.docs
      .map((doc) => toImportHistoryRecord(doc.id, doc.data() as ImportHistoryDocument))
      .sort((a, b) => b.importedAt.localeCompare(a.importedAt));
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

    return toImportHistoryDetail(snapshot.id, data);
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

    return toImportHistoryDetail(importId, nextDocument);
  },
};
