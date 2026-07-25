/**
 * Firestore repository for Saved Import Mappings.
 *
 * Path:
 *   organizations/{orgId}/importSavedMappings/{entity}__{reportType}
 *
 * Generic: keyed by entity + reportType only — never by vendor name.
 */

import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';

import {
  buildSavedMappingDocument,
  savedMappingDocId,
} from '@/lib/import/services/saved-mapping.service';
import {
  SAVED_MAPPING_SCHEMA_VERSION,
  type SavedColumnMapping,
  type SavedMappingDocument,
} from '@/lib/import/saved-mapping/types';
import { buildAuditFields, getOrgCollection } from '@/lib/repositories/base.repository';

const COLLECTION = 'importSavedMappings';

type SavedMappingFirestoreDoc = {
  organizationId: string;
  entity: string;
  reportType: string;
  version: number;
  mappings: SavedColumnMapping[];
  createdAt: Timestamp;
  lastUsedAt: Timestamp;
  updatedAt?: Timestamp;
  createdBy?: string;
  updatedBy?: string;
};

export const importSavedMappingRepository = {
  async get(
    orgId: string,
    entity: string,
    reportType: string,
  ): Promise<SavedMappingDocument | null> {
    const docId = savedMappingDocId(entity, reportType);
    const snap = await getOrgCollection(orgId, COLLECTION).doc(docId).get();

    if (!snap.exists) {
      return null;
    }

    return fromFirestore(snap.data() as SavedMappingFirestoreDoc);
  },

  /**
   * Upserts a Saved Mapping for (org, entity, reportType).
   * Preserves createdAt when the document already exists.
   */
  async save(
    orgId: string,
    userId: string,
    input: {
      entity: string;
      reportType: string;
      mappings: readonly { sourceHeader: string; targetField: string }[];
      approvedFrom?: 'auto' | 'manual' | 'import';
      version?: number;
    },
  ): Promise<SavedMappingDocument> {
    const docId = savedMappingDocId(input.entity, input.reportType);
    const ref = getOrgCollection(orgId, COLLECTION).doc(docId);
    const existingSnap = await ref.get();
    const existing = existingSnap.exists
      ? fromFirestore(existingSnap.data() as SavedMappingFirestoreDoc)
      : null;

    const domain = buildSavedMappingDocument({
      organizationId: orgId,
      entity: input.entity,
      reportType: input.reportType,
      mappings: input.mappings,
      approvedFrom: input.approvedFrom,
      version: input.version ?? SAVED_MAPPING_SCHEMA_VERSION,
      existing,
    });

    const audit = buildAuditFields(userId, !existing);
    const payload: SavedMappingFirestoreDoc = {
      organizationId: orgId,
      entity: domain.entity,
      reportType: domain.reportType,
      version: domain.version,
      mappings: [...domain.mappings],
      createdAt: existing
        ? (existingSnap.data() as SavedMappingFirestoreDoc).createdAt
        : (audit.createdAt as Timestamp),
      lastUsedAt: Timestamp.fromDate(domain.lastUsedAt),
      updatedAt: audit.updatedAt as Timestamp,
      ...(existing
        ? { updatedBy: userId }
        : { createdBy: userId, updatedBy: userId }),
    };

    await ref.set(payload, { merge: true });

    return domain;
  },

  async touchLastUsed(orgId: string, entity: string, reportType: string): Promise<void> {
    const docId = savedMappingDocId(entity, reportType);
    const ref = getOrgCollection(orgId, COLLECTION).doc(docId);
    const snap = await ref.get();

    if (!snap.exists) {
      return;
    }

    await ref.update({ lastUsedAt: Timestamp.now() });
  },
};

function fromFirestore(data: SavedMappingFirestoreDoc): SavedMappingDocument {
  return {
    organizationId: data.organizationId,
    entity: data.entity,
    reportType: data.reportType,
    version: data.version,
    mappings: data.mappings ?? [],
    createdAt: data.createdAt.toDate(),
    lastUsedAt: data.lastUsedAt.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  };
}
