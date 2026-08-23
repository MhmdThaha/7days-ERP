/**
 * Phase 4A — write-only duplicate lookup index types.
 *
 * These indexes are candidate lookup structures only; they do not decide duplicates.
 */

import type { Timestamp } from 'firebase-admin/firestore';

import type { ImportHistoryStatus } from '@/lib/import/duplicate/duplicate-import.types';

export type ImportDuplicateInvoiceHitDocument = {
  organizationId: string;
  importId: string;
  invoiceNormalized: string;
  invoiceHash: string;
  status: ImportHistoryStatus;
  indexedAt: Timestamp;
  createdBy: string;
};

export type ImportDuplicateRowHitDocument = {
  organizationId: string;
  importId: string;
  fingerprintHash: string;
  status: ImportHistoryStatus;
  indexedAt: Timestamp;
  createdBy: string;
};

export type IndexImportDuplicateHitsInput = {
  importId: string;
  invoiceNumbers: readonly string[];
  rowFingerprints: readonly string[];
  status: ImportHistoryStatus;
};

export type IndexImportDuplicateHitsResult = {
  success: boolean;
  invoiceHitsWritten: number;
  rowHitsWritten: number;
  batchesCommitted: number;
};
