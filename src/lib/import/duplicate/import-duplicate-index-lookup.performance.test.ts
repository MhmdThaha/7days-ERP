/**
 * Batched index lookup operation counts (TEST ONLY — no emulator).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  countBatchedIndexQueries,
  IMPORT_DUPLICATE_INDEX_IN_QUERY_MAX,
  lookupCandidateImportIdsFromIndexBatched,
} from '@/lib/import/duplicate/import-duplicate-index-lookup.service';
import { buildDuplicateImportFingerprints } from '@/lib/import/duplicate/duplicate-import.service';
import { withCollectionGroupMock } from '@/lib/import/duplicate/import-duplicate-index-collection-group.mock';

type DocMap = Map<string, Record<string, unknown>>;

function createHarness() {
  const docs: DocMap = new Map();
  const db = withCollectionGroupMock({ collectionGroup: () => ({}) }, docs);
  return { docs, db };
}

const harness = vi.hoisted(() => ({
  current: null as ReturnType<typeof createHarness> | null,
}));

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => harness.current!.db,
}));

const ORG = 'org-perf-lookup';

function buildFingerprints(rowCount: number) {
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    rowNumber: index + 2,
    originalValues: {
      saleDate: '2026-08-21',
      customerName: 'Store',
      productName: 'Bread',
      quantity: 1,
      saleNumber: `INV-P-${index}`,
    },
    normalizedValues: {
      saleDate: '2026-08-21',
      customerName: 'Store',
      productName: 'Bread',
      quantity: 1,
      saleNumber: `INV-P-${index}`,
    },
    reportDetectionResult: {} as never,
    productMatchResult: { matchedProductId: 'prod-bread' } as never,
    conflictEngineResult: {} as never,
    confidenceResult: {} as never,
  }));

  return buildDuplicateImportFingerprints(rows as never);
}

function expectedLegacyQueryCount(rowCount: number) {
  return rowCount * 2;
}

function expectedBatchedQueryCount(rowCount: number) {
  return countBatchedIndexQueries(rowCount, rowCount);
}

describe('batched index lookup operation counts', () => {
  beforeEach(() => {
    harness.current = createHarness();
  });

  for (const rowCount of [10, 100, 1_000] as const) {
    it(`${rowCount} unique rows uses batched query count`, async () => {
      const fp = buildFingerprints(rowCount);
      const result = await lookupCandidateImportIdsFromIndexBatched(ORG, fp);

      expect(result.indexLookupCount).toBe(expectedBatchedQueryCount(rowCount));
      expect(result.indexLookupCount).toBeLessThan(expectedLegacyQueryCount(rowCount));
    });
  }

  it('reports batch reduction formula at Firestore in limit', () => {
    expect(expectedBatchedQueryCount(IMPORT_DUPLICATE_INDEX_IN_QUERY_MAX)).toBe(2);
    expect(expectedBatchedQueryCount(IMPORT_DUPLICATE_INDEX_IN_QUERY_MAX + 1)).toBe(4);
  });
});
