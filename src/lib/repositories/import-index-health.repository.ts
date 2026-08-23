import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';

import {
  ORG_IMPORT_INDEX_COVERAGE,
  type OrgImportIndexCoverage,
  type OrgImportIndexMeta,
  type ImportDuplicateIndexStatus,
} from '@/lib/import/duplicate/import-index-health.types';
import { buildAuditFields, getOrgCollection } from '@/lib/repositories/base.repository';

const META_COLLECTION = 'importIndexMeta';
const META_DOC_ID = 'coverage';

type OrgImportIndexMetaDocument = {
  organizationId: string;
  coverage: OrgImportIndexCoverage;
  updatedAt: Timestamp;
  updatedBy: string;
  lastRepairStartedAt: Timestamp | null;
  lastRepairCompletedAt: Timestamp | null;
  lastRepairError: string | null;
  blockingImportCount: number;
  incompleteImportCount: number;
};

function toOrgImportIndexMeta(data: OrgImportIndexMetaDocument): OrgImportIndexMeta {
  return {
    coverage: data.coverage,
    updatedAt: data.updatedAt.toDate().toISOString(),
    updatedBy: data.updatedBy,
    lastRepairStartedAt: data.lastRepairStartedAt?.toDate().toISOString() ?? null,
    lastRepairCompletedAt: data.lastRepairCompletedAt?.toDate().toISOString() ?? null,
    lastRepairError: data.lastRepairError,
    blockingImportCount: data.blockingImportCount,
    incompleteImportCount: data.incompleteImportCount,
  };
}

export const importIndexHealthRepository = {
  async getOrgCoverage(orgId: string): Promise<OrgImportIndexMeta | null> {
    const snapshot = await getOrgCollection(orgId, META_COLLECTION).doc(META_DOC_ID).get();

    if (!snapshot.exists) {
      return null;
    }

    return toOrgImportIndexMeta(snapshot.data() as OrgImportIndexMetaDocument);
  },

  isCoverageComplete(coverage: OrgImportIndexMeta | null): boolean {
    return coverage?.coverage === ORG_IMPORT_INDEX_COVERAGE.COMPLETE;
  },

  async setOrgCoverage(
    orgId: string,
    userId: string,
    update: {
      coverage: OrgImportIndexCoverage;
      blockingImportCount?: number;
      incompleteImportCount?: number;
      lastRepairStartedAt?: Date | null;
      lastRepairCompletedAt?: Date | null;
      lastRepairError?: string | null;
    },
  ): Promise<OrgImportIndexMeta> {
    const ref = getOrgCollection(orgId, META_COLLECTION).doc(META_DOC_ID);
    const existing = await ref.get();
    const audit = buildAuditFields(userId, !existing.exists);
    const now = audit.updatedAt;

    const document: OrgImportIndexMetaDocument = {
      organizationId: orgId,
      coverage: update.coverage,
      updatedAt: now,
      updatedBy: userId,
      lastRepairStartedAt:
        update.lastRepairStartedAt === undefined
          ? ((existing.data() as OrgImportIndexMetaDocument | undefined)?.lastRepairStartedAt ?? null)
          : update.lastRepairStartedAt
            ? Timestamp.fromDate(update.lastRepairStartedAt)
            : null,
      lastRepairCompletedAt:
        update.lastRepairCompletedAt === undefined
          ? ((existing.data() as OrgImportIndexMetaDocument | undefined)?.lastRepairCompletedAt ?? null)
          : update.lastRepairCompletedAt
            ? Timestamp.fromDate(update.lastRepairCompletedAt)
            : null,
      lastRepairError:
        update.lastRepairError === undefined
          ? ((existing.data() as OrgImportIndexMetaDocument | undefined)?.lastRepairError ?? null)
          : update.lastRepairError,
      blockingImportCount:
        update.blockingImportCount ??
        ((existing.data() as OrgImportIndexMetaDocument | undefined)?.blockingImportCount ?? 0),
      incompleteImportCount:
        update.incompleteImportCount ??
        ((existing.data() as OrgImportIndexMetaDocument | undefined)?.incompleteImportCount ?? 0),
    };

    await ref.set(document, { merge: true });

    return toOrgImportIndexMeta(document);
  },

  async setImportDuplicateIndexStatus(
    orgId: string,
    importId: string,
    userId: string,
    status: ImportDuplicateIndexStatus,
  ): Promise<void> {
    const ref = getOrgCollection(orgId, 'importHistory').doc(importId);
    const audit = buildAuditFields(userId, false);

    await ref.set(
      {
        duplicateIndexStatus: status,
        updatedAt: audit.updatedAt,
        updatedBy: audit.updatedBy,
      },
      { merge: true },
    );
  },
};
