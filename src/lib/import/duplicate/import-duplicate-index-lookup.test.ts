/**
 * Batched duplicate index lookup — parity and batch-boundary tests (TEST ONLY).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildDuplicateImportFingerprints } from '@/lib/import/duplicate/duplicate-import.service';
import {
  countBatchedIndexQueries,
  IMPORT_DUPLICATE_INDEX_IN_QUERY_MAX,
  lookupCandidateImportIdsFromIndexBatched,
} from '@/lib/import/duplicate/import-duplicate-index-lookup.service';
import { hashImportIdentity } from '@/lib/repositories/import-history.repository';

type DocMap = Map<string, Record<string, unknown>>;

function createInMemoryFirestore() {
  const docs: DocMap = new Map();

  function collectionGroupQuery(collectionName: string) {
    const filters: Array<{ field: string; op: string; value: unknown }> = [];

    function matchingDocs() {
      return [...docs.entries()]
        .filter(([path, data]) => {
          const marker = `/${collectionName}/`;
          const markerIndex = path.indexOf(marker);

          if (markerIndex === -1) {
            return false;
          }

          const suffix = path.slice(markerIndex + marker.length);

          if (suffix.includes('/')) {
            return false;
          }

          for (const filter of filters) {
            if (filter.op === '==') {
              if (data[filter.field] !== filter.value) {
                return false;
              }
            } else if (filter.op === 'in') {
              const values = filter.value as unknown[];

              if (!values.includes(data[filter.field])) {
                return false;
              }
            }
          }

          return true;
        })
        .map(([path, data]) => ({
          id: path.slice(path.lastIndexOf('/') + 1),
          data: () => data,
        }));
    }

    const queryBuilder = {
      where(field: string, op: string, value: unknown) {
        filters.push({ field, op, value });
        return queryBuilder;
      },
      get: async () => {
        const docsForQuery = matchingDocs();
        return { docs: docsForQuery, empty: docsForQuery.length === 0 };
      },
    };

    return queryBuilder;
  }

  const db = {
    collectionGroup: (name: string) => collectionGroupQuery(name),
  };

  return { docs, db };
}

const harness = vi.hoisted(() => ({
  current: null as ReturnType<typeof createInMemoryFirestore> | null,
}));

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => harness.current!.db,
}));

const ORG = 'org-lookup-batch';

async function seedHit(
  orgId: string,
  type: 'invoice' | 'row',
  hash: string,
  importId: string,
  fields: Record<string, unknown>,
) {
  const collection = type === 'invoice' ? 'importDuplicateInvoices' : 'importDuplicateRows';
  const path = `organizations/${orgId}/${collection}/${hash}/hits/${importId}`;
  harness.current!.docs.set(path, {
    organizationId: orgId,
    importId,
    ...fields,
  });
}

function fingerprintsFromInvoices(invoices: string[]) {
  const rows = invoices.map((invoice, index) => ({
    rowNumber: index + 2,
    originalValues: {
      saleDate: '2026-08-21',
      customerName: 'Store',
      productName: 'Bread',
      quantity: 1,
      saleNumber: invoice,
    },
    normalizedValues: {
      saleDate: '2026-08-21',
      customerName: 'Store',
      productName: 'Bread',
      quantity: 1,
      saleNumber: invoice,
    },
    reportDetectionResult: {} as never,
    productMatchResult: { matchedProductId: 'prod-bread' } as never,
    conflictEngineResult: {} as never,
    confidenceResult: {} as never,
  }));

  return buildDuplicateImportFingerprints(rows as never);
}

describe('import duplicate index batched lookup', () => {
  beforeEach(() => {
    harness.current = createInMemoryFirestore();
  });

  it('deduplicates repeated invoice numbers before querying', async () => {
    const invoice = 'INV-DUP';
    const invoiceHash = hashImportIdentity(invoice.trim().toUpperCase());
    await seedHit(ORG, 'invoice', invoiceHash, 'imp-dup', {
      invoiceHash,
      invoiceNormalized: invoice,
    });

    const fp = fingerprintsFromInvoices([invoice, invoice, invoice]);
    const batched = await lookupCandidateImportIdsFromIndexBatched(ORG, fp);

    expect(batched.indexLookupCount).toBe(
      countBatchedIndexQueries(fp.invoiceNumbers.length, fp.rowFingerprints.length),
    );
    expect([...batched.candidateIds]).toEqual(['imp-dup']);
  });

  it('handles batch boundaries at 30 and 31 hashes', async () => {
    const invoiceCount = IMPORT_DUPLICATE_INDEX_IN_QUERY_MAX + 1;
    const invoices = Array.from({ length: invoiceCount }, (_, index) => `INV-B-${index}`);

    for (const invoice of invoices) {
      const invoiceHash = hashImportIdentity(invoice.trim().toUpperCase());
      await seedHit(ORG, 'invoice', invoiceHash, `imp-${invoice}`, {
        invoiceHash,
        invoiceNormalized: invoice,
      });
    }

    const fp = fingerprintsFromInvoices(invoices);
    const batched = await lookupCandidateImportIdsFromIndexBatched(ORG, fp);

    expect(batched.indexLookupCount).toBe(countBatchedIndexQueries(invoiceCount, invoiceCount));
    expect(batched.candidateIds.size).toBe(invoiceCount);
    expect(countBatchedIndexQueries(invoiceCount, 0)).toBe(2);
  });

  it('returns zero queries for empty fingerprint sets', async () => {
    const fp = {
      fileFingerprint: '',
      invoiceNumbers: [],
      rowFingerprints: [],
    };
    const batched = await lookupCandidateImportIdsFromIndexBatched(ORG, fp);

    expect(batched.indexLookupCount).toBe(0);
    expect(batched.candidateIds.size).toBe(0);
  });

  it('preserves organization isolation in collection-group filters', async () => {
    const invoice = 'INV-ISO';
    const invoiceHash = hashImportIdentity(invoice.trim().toUpperCase());

    await seedHit(ORG, 'invoice', invoiceHash, 'imp-org-a', {
      invoiceHash,
      invoiceNormalized: invoice,
    });
    await seedHit('org-other', 'invoice', invoiceHash, 'imp-org-b', {
      invoiceHash,
      invoiceNormalized: invoice,
    });

    const fp = fingerprintsFromInvoices([invoice]);
    const batched = await lookupCandidateImportIdsFromIndexBatched(ORG, fp);

    expect([...batched.candidateIds]).toEqual(['imp-org-a']);
  });

  it('unions invoice and row hits from separate batched queries', async () => {
    const invoice = 'INV-MIX';
    const invoiceHash = hashImportIdentity(invoice.trim().toUpperCase());
    const fp = buildDuplicateImportFingerprints([
      {
        rowNumber: 2,
        originalValues: {
          saleDate: '2026-08-21',
          customerName: 'Store',
          productName: 'Bread',
          quantity: 1,
          saleNumber: invoice,
        },
        normalizedValues: {
          saleDate: '2026-08-21',
          customerName: 'Store',
          productName: 'Bread',
          quantity: 1,
          saleNumber: invoice,
        },
        reportDetectionResult: {} as never,
        productMatchResult: { matchedProductId: 'prod-bread' } as never,
        conflictEngineResult: {} as never,
        confidenceResult: {} as never,
      },
    ] as never);
    const rowHash = hashImportIdentity(fp.rowFingerprints[0]!);

    await seedHit(ORG, 'invoice', invoiceHash, 'imp-invoice', {
      invoiceHash,
      invoiceNormalized: invoice,
    });
    await seedHit(ORG, 'row', rowHash, 'imp-row', { fingerprintHash: rowHash });

    const batched = await lookupCandidateImportIdsFromIndexBatched(ORG, fp);

    expect(batched.indexLookupCount).toBe(2);
    expect([...batched.candidateIds].sort()).toEqual(['imp-invoice', 'imp-row']);
  });
});
