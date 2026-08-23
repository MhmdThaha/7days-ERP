/**
 * Phase 4A — import duplicate index write-only tests.
 * In-memory Firestore only — no production Firebase.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IMPORT_HISTORY_STATUS } from '@/lib/import/duplicate';
import {
  IMPORT_DUPLICATE_INDEX_MAX_BATCH_WRITES,
  importDuplicateIndexRepository,
  normalizeInvoiceForDuplicateIndex,
  uniqueInvoiceIndexHits,
  uniqueRowIndexHits,
} from '@/lib/repositories/import-duplicate-index.repository';
import { hashImportIdentity } from '@/lib/repositories/import-history.repository';

type DocMap = Map<string, Record<string, unknown>>;

type DocRef = {
  id: string;
  path: string;
  collection: (name: string) => CollectionRef;
};

type CollectionRef = {
  doc: (id?: string) => DocRef;
};

function createInMemoryFirestore(failBatchIndexes: readonly number[] = []) {
  const docs: DocMap = new Map();
  let autoId = 0;
  let batchCounter = 0;

  function collectionAt(basePath: string): CollectionRef {
    return {
      doc(id?: string): DocRef {
        const docId = id ?? `auto-${++autoId}`;
        const path = `${basePath}/${docId}`;

        return {
          id: docId,
          path,
          collection: (name: string) => collectionAt(`${path}/${name}`),
        };
      },
    };
  }

  const db = {
    collection: (name: string) => collectionAt(name),
    batch: () => {
      const batchIndex = batchCounter++;
      const ops: Array<{
        path: string;
        data: Record<string, unknown>;
        merge: boolean;
      }> = [];

      return {
        set: (
          ref: DocRef,
          data: Record<string, unknown>,
          options?: { merge?: boolean },
        ) => {
          ops.push({ path: ref.path, data: { ...data }, merge: options?.merge ?? false });
        },
        commit: async () => {
          if (failBatchIndexes.includes(batchIndex)) {
            throw new Error('Firestore batch unavailable');
          }

          for (const op of ops) {
            const previous = docs.get(op.path);

            if (op.merge && previous) {
              docs.set(op.path, { ...previous, ...op.data });
            } else {
              docs.set(op.path, { ...op.data });
            }
          }
        },
      };
    },
  };

  return { db, docs, batchCounter: () => batchCounter };
}

const harness = vi.hoisted(() => ({
  current: null as ReturnType<typeof createInMemoryFirestore> | null,
  failBatchIndexes: [] as number[],
}));

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => {
    if (!harness.current) {
      throw new Error('In-memory Firestore was not initialized');
    }

    return harness.current.db;
  },
}));

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const USER = 'user-1';
const IMPORT_A = 'imp-a';

function invoiceHitPath(orgId: string, invoice: string, importId: string) {
  const normalized = normalizeInvoiceForDuplicateIndex(invoice)!;
  const hash = hashImportIdentity(normalized);

  return `organizations/${orgId}/importDuplicateInvoices/${hash}/hits/${importId}`;
}

function rowHitPath(orgId: string, fingerprint: string, importId: string) {
  const hash = hashImportIdentity(fingerprint);

  return `organizations/${orgId}/importDuplicateRows/${hash}/hits/${importId}`;
}

describe('import duplicate index helpers', () => {
  it('normalizes invoices like duplicate analysis', () => {
    expect(normalizeInvoiceForDuplicateIndex(' inv-100 ')).toBe('INV-100');
    expect(normalizeInvoiceForDuplicateIndex('')).toBeNull();
  });

  it('dedupes duplicate invoices within one import', () => {
    const hits = uniqueInvoiceIndexHits(['INV-1', 'inv-1', 'INV-2']);

    expect(hits).toHaveLength(2);
    expect(hits.map((hit) => hit.invoiceNormalized).sort()).toEqual(['INV-1', 'INV-2']);
  });

  it('dedupes duplicate row fingerprints within one import', () => {
    const hits = uniqueRowIndexHits(['fp-a', 'fp-a', 'fp-b']);

    expect(hits).toHaveLength(2);
  });
});

describe('importDuplicateIndexRepository.indexImportDuplicateHits', () => {
  beforeEach(() => {
    harness.failBatchIndexes = [];
    harness.current = createInMemoryFirestore(harness.failBatchIndexes);
  });

  it('creates invoice and row hit documents', async () => {
    const result = await importDuplicateIndexRepository.indexImportDuplicateHits(
      ORG_A,
      USER,
      {
        importId: IMPORT_A,
        invoiceNumbers: ['INV-100'],
        rowFingerprints: ['row-fp-1'],
        status: IMPORT_HISTORY_STATUS.IMPORTING,
      },
    );

    expect(result.success).toBe(true);
    expect(result.invoiceHitsWritten).toBe(1);
    expect(result.rowHitsWritten).toBe(1);
    expect(result.batchesCommitted).toBe(1);

    expect(harness.current?.docs.get(invoiceHitPath(ORG_A, 'INV-100', IMPORT_A))).toMatchObject({
      organizationId: ORG_A,
      importId: IMPORT_A,
      invoiceNormalized: 'INV-100',
      status: IMPORT_HISTORY_STATUS.IMPORTING,
      createdBy: USER,
    });

    expect(harness.current?.docs.get(rowHitPath(ORG_A, 'row-fp-1', IMPORT_A))).toMatchObject({
      organizationId: ORG_A,
      importId: IMPORT_A,
      status: IMPORT_HISTORY_STATUS.IMPORTING,
      createdBy: USER,
    });
  });

  it('is idempotent when indexing the same import twice', async () => {
    const input = {
      importId: IMPORT_A,
      invoiceNumbers: ['INV-100'],
      rowFingerprints: ['row-fp-1'],
      status: IMPORT_HISTORY_STATUS.IMPORTING,
    } as const;

    await importDuplicateIndexRepository.indexImportDuplicateHits(ORG_A, USER, input);
    await importDuplicateIndexRepository.indexImportDuplicateHits(ORG_A, USER, {
      ...input,
      status: IMPORT_HISTORY_STATUS.IMPORTED,
    });

    expect(harness.current?.docs.size).toBe(2);
    expect(harness.current?.docs.get(invoiceHitPath(ORG_A, 'INV-100', IMPORT_A))).toMatchObject({
      status: IMPORT_HISTORY_STATUS.IMPORTED,
    });
  });

  it('keeps organization isolation', async () => {
    await importDuplicateIndexRepository.indexImportDuplicateHits(ORG_A, USER, {
      importId: IMPORT_A,
      invoiceNumbers: ['INV-100'],
      rowFingerprints: ['row-fp-1'],
      status: IMPORT_HISTORY_STATUS.IMPORTING,
    });

    await importDuplicateIndexRepository.indexImportDuplicateHits(ORG_B, USER, {
      importId: IMPORT_A,
      invoiceNumbers: ['INV-100'],
      rowFingerprints: ['row-fp-1'],
      status: IMPORT_HISTORY_STATUS.IMPORTING,
    });

    expect(harness.current?.docs.get(invoiceHitPath(ORG_A, 'INV-100', IMPORT_A))).toBeDefined();
    expect(harness.current?.docs.get(invoiceHitPath(ORG_B, 'INV-100', IMPORT_A))).toBeDefined();
    expect(harness.current?.docs.get(invoiceHitPath(ORG_A, 'INV-100', IMPORT_A))).not.toEqual(
      harness.current?.docs.get(invoiceHitPath(ORG_B, 'INV-100', IMPORT_A)),
    );
  });

  it('dedupes repeated invoice and fingerprint values before writing', async () => {
    const result = await importDuplicateIndexRepository.indexImportDuplicateHits(
      ORG_A,
      USER,
      {
        importId: IMPORT_A,
        invoiceNumbers: ['INV-1', 'inv-1', 'INV-2', 'INV-2'],
        rowFingerprints: ['fp-1', 'fp-1', 'fp-2'],
        status: IMPORT_HISTORY_STATUS.IMPORTING,
      },
    );

    expect(result.invoiceHitsWritten).toBe(2);
    expect(result.rowHitsWritten).toBe(2);
    expect(harness.current?.docs.size).toBe(4);
  });

  it('returns success without writes for empty inputs', async () => {
    const result = await importDuplicateIndexRepository.indexImportDuplicateHits(
      ORG_A,
      USER,
      {
        importId: IMPORT_A,
        invoiceNumbers: [],
        rowFingerprints: [],
        status: IMPORT_HISTORY_STATUS.IMPORTING,
      },
    );

    expect(result).toEqual({
      success: true,
      invoiceHitsWritten: 0,
      rowHitsWritten: 0,
      batchesCommitted: 0,
    });
    expect(harness.current?.docs.size).toBe(0);
  });

  it('does not throw when a batch commit fails', async () => {
    harness.current = createInMemoryFirestore([0]);

    const result = await importDuplicateIndexRepository.indexImportDuplicateHits(
      ORG_A,
      USER,
      {
        importId: IMPORT_A,
        invoiceNumbers: ['INV-100'],
        rowFingerprints: ['row-fp-1'],
        status: IMPORT_HISTORY_STATUS.IMPORTING,
      },
    );

    expect(result.success).toBe(false);
    expect(result.batchesCommitted).toBe(0);
    expect(harness.current.docs.size).toBe(0);
  });

  it('batches large imports under the Firestore operation limit', async () => {
    const invoiceCount = 600;
    const rowCount = 600;
    const invoiceNumbers = Array.from({ length: invoiceCount }, (_, index) => `INV-${index}`);
    const rowFingerprints = Array.from({ length: rowCount }, (_, index) => `row-${index}`);

    const result = await importDuplicateIndexRepository.indexImportDuplicateHits(
      ORG_A,
      USER,
      {
        importId: IMPORT_A,
        invoiceNumbers,
        rowFingerprints,
        status: IMPORT_HISTORY_STATUS.IMPORTING,
      },
    );

    expect(result.success).toBe(true);
    expect(result.invoiceHitsWritten).toBe(invoiceCount);
    expect(result.rowHitsWritten).toBe(rowCount);
    expect(result.batchesCommitted).toBe(
      Math.ceil((invoiceCount + rowCount) / IMPORT_DUPLICATE_INDEX_MAX_BATCH_WRITES),
    );
    expect(harness.current?.docs.size).toBe(invoiceCount + rowCount);
  });

  it('repairs missing hits on retry with the same importId', async () => {
    harness.failBatchIndexes = [0];
    harness.current = createInMemoryFirestore(harness.failBatchIndexes);

    const failed = await importDuplicateIndexRepository.indexImportDuplicateHits(
      ORG_A,
      USER,
      {
        importId: IMPORT_A,
        invoiceNumbers: ['INV-100'],
        rowFingerprints: ['row-fp-1'],
        status: IMPORT_HISTORY_STATUS.IMPORTING,
      },
    );

    expect(failed.success).toBe(false);
    expect(harness.current.docs.size).toBe(0);

    harness.failBatchIndexes = [];
    harness.current = createInMemoryFirestore(harness.failBatchIndexes);

    const repaired = await importDuplicateIndexRepository.indexImportDuplicateHits(
      ORG_A,
      USER,
      {
        importId: IMPORT_A,
        invoiceNumbers: ['INV-100'],
        rowFingerprints: ['row-fp-1'],
        status: IMPORT_HISTORY_STATUS.IMPORTING,
      },
    );

    expect(repaired.success).toBe(true);
    expect(harness.current.docs.size).toBe(2);
  });
});
