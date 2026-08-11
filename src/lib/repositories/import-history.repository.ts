import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';

import type { ImportHistoryRecord, ImportHistoryStatus } from '@/lib/import/duplicate';
import type { CreateImportHistoryInput } from '@/lib/import/execution/sales-import-execution.types';
import type { ImportExecutionStatus } from '@/lib/import/execution/sales-import-execution.types';
import { buildAuditFields, getOrgCollection } from '@/lib/repositories/base.repository';

const COLLECTION = 'importHistory';

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

export type ImportHistoryDetail = ImportHistoryRecord & {
  rowsImported: number;
  rowsSkipped: number;
  rowsFailed: number;
  saleIds: readonly string[];
  executionStatus: ImportExecutionStatus;
};

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

export const importHistoryRepository = {
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
    },
  ): Promise<ImportHistoryDetail> {
    const ref = getOrgCollection(orgId, COLLECTION).doc(importId);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      throw new Error(`Import history ${importId} not found`);
    }

    const data = snapshot.data() as ImportHistoryDocument;

    if (data.deletedAt) {
      throw new Error(`Import history ${importId} not found`);
    }

    const audit = buildAuditFields(userId, false);
    const nextDocument: ImportHistoryDocument = {
      ...data,
      status: update.status,
      executionStatus: update.executionStatus ?? data.executionStatus,
      updatedAt: audit.updatedAt,
      updatedBy: audit.updatedBy,
    };

    await ref.update({
      status: nextDocument.status,
      executionStatus: nextDocument.executionStatus,
      updatedAt: nextDocument.updatedAt,
      updatedBy: nextDocument.updatedBy,
    });

    return toImportHistoryDetail(importId, nextDocument);
  },
};
