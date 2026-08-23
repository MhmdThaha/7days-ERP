/**
 * Chunked duplicate metadata storage for large importHistory records.
 */

import type { Timestamp } from 'firebase-admin/firestore';

export const DUPLICATE_METADATA_STORAGE = {
  INLINE: 'inline',
  CHUNKED: 'chunked',
} as const;

export type DuplicateMetadataStorage =
  (typeof DUPLICATE_METADATA_STORAGE)[keyof typeof DUPLICATE_METADATA_STORAGE];

export const DUPLICATE_METADATA_CHUNK_KIND = {
  ROW_FINGERPRINTS: 'rowFingerprints',
  INVOICE_NUMBERS: 'invoiceNumbers',
} as const;

export type DuplicateMetadataChunkKind =
  (typeof DUPLICATE_METADATA_CHUNK_KIND)[keyof typeof DUPLICATE_METADATA_CHUNK_KIND];

/** Chunk document: importHistory/{importId}/duplicateMetadata/{chunkDocId} */
export type ImportDuplicateMetadataChunkDocument = {
  organizationId: string;
  importId: string;
  kind: DuplicateMetadataChunkKind;
  chunkIndex: number;
  values: string[];
  createdAt: Timestamp;
  createdBy: string;
};

export type ImportDuplicateMetadataWriteInput = {
  invoiceNumbers: readonly string[];
  rowFingerprints: readonly string[];
};

export type ImportDuplicateMetadataWriteResult = {
  storage: DuplicateMetadataStorage;
  rowChunkCount: number;
  invoiceChunkCount: number;
  complete: boolean;
};

export type ImportDuplicateMetadataReadResult = {
  invoiceNumbers: string[];
  rowFingerprints: string[];
  storage: DuplicateMetadataStorage;
  complete: boolean;
  rowChunkCount: number;
  invoiceChunkCount: number;
};
