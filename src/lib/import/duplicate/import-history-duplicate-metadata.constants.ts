/**
 * Chunk sizing for importHistory duplicate metadata.
 *
 * Firestore document limit: 1 MiB (1,048,576 bytes).
 * Row fingerprints are JSON strings ~80–250 bytes each in practice.
 * At 1,000 fingerprints × ~180 bytes ≈ 180 KB per chunk (safe margin).
 */

/** New imports at or above this row count use chunked duplicate metadata. */
export const DUPLICATE_METADATA_CHUNK_THRESHOLD_ROWS = 500;

/** Max row fingerprints per chunk document. */
export const DUPLICATE_METADATA_ROW_FINGERPRINTS_PER_CHUNK = 1_000;

/** Max invoice numbers per chunk document. */
export const DUPLICATE_METADATA_INVOICE_NUMBERS_PER_CHUNK = 2_000;

export const DUPLICATE_METADATA_SUBCOLLECTION = 'duplicateMetadata';

/** Target max estimated bytes for a single chunk (well under 1 MiB). */
export const DUPLICATE_METADATA_MAX_CHUNK_BYTES = 400_000;

/** Max concurrent chunk document reads per import (matches index lookup concurrency). */
export const DUPLICATE_METADATA_CHUNK_READ_CONCURRENCY = 8;
