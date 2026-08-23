/**
 * Duplicate import review presentation tests.
 */

import { describe, expect, it } from 'vitest';

import {
  buildDuplicateImportReview,
  buildDuplicateImportWarning,
  countSelectedDuplicateImports,
  defaultSelectedDuplicateRowNumbers,
  duplicateReviewSkippedRowNumbers,
  duplicateResultNeedsRowReview,
  duplicateResultNeedsUserConfirmation,
  formatSaleRowReviewLabel,
} from '@/lib/import/duplicate/duplicate-import-review';
import {
  buildDuplicateImportRowFingerprint,
} from '@/lib/import/duplicate/duplicate-import.service';
import {
  DUPLICATE_IMPORT_RECOMMENDATION,
  DUPLICATE_IMPORT_STATUS,
  type DuplicateImportResult,
} from '@/lib/import/duplicate';
import type { ResolvedImportReviewRow } from '@/lib/import/resolution/types';
import {
  AUTO_IMPORT_RECOMMENDATION,
  CONFIDENCE_LEVEL,
} from '@/lib/import/services/confidence-engine.service';
import { CONFLICT_ENGINE_STATUS } from '@/lib/import/services/conflict-engine.service';
import { PRODUCT_MATCH_STATUS } from '@/lib/import/services/product-matching.service';

function importableRow(
  rowNumber: number,
  values: Record<string, unknown>,
): ResolvedImportReviewRow {
  return {
    rowNumber,
    originalValues: values,
    normalizedValues: values as ResolvedImportReviewRow['normalizedValues'],
    reportDetectionResult: {} as ResolvedImportReviewRow['reportDetectionResult'],
    productMatchResult: {
      status: PRODUCT_MATCH_STATUS.MATCHED,
      matchedProductId: 'prod-bread',
      matchedProductName: 'Bread',
      confidence: 98,
      reason: 'Exact Name Match',
    },
    conflictEngineResult: {
      status: CONFLICT_ENGINE_STATUS.READY,
      conflicts: [],
      warnings: [],
      blockingReason: null,
      recommendedAction: null,
      confidencePenalty: 0,
    },
    confidenceResult: {
      confidenceScore: 90,
      confidenceLevel: CONFIDENCE_LEVEL.HIGH,
      confidenceReasons: [],
      autoImportRecommendation: AUTO_IMPORT_RECOMMENDATION.PREVIEW_FIRST,
    },
  };
}

function duplicateResult(
  overrides: Partial<DuplicateImportResult> = {},
): DuplicateImportResult {
  return {
    status: DUPLICATE_IMPORT_STATUS.HIGH_CONFIDENCE_DUPLICATE,
    confidence: 90,
    matchedImport: null,
    matchedInvoices: [],
    matchedRows: 0,
    duplicateRowFingerprints: [],
    duplicateReasons: [],
    recommendation: DUPLICATE_IMPORT_RECOMMENDATION.SKIP_DUPLICATES,
    ...overrides,
  };
}

describe('buildDuplicateImportReview', () => {
  it('returns no items when there are no duplicate fingerprints', () => {
    const rows = [
      importableRow(2, {
        saleDate: '2026-08-21',
        customerName: 'Ravi',
        productName: 'Bread',
        quantity: 10,
      }),
    ];

    const review = buildDuplicateImportReview(rows, duplicateResult());

    expect(review.items).toHaveLength(0);
    expect(review.nonFlaggedImportableCount).toBe(1);
  });

  it('flags overlapping rows with friendly labels and invoice warnings', () => {
    const row = importableRow(2, {
      saleDate: '2026-08-21',
      customerName: 'Ravi',
      productName: 'Bread',
      quantity: 10,
      saleNumber: 'INV-105',
    });
    const fingerprint = buildDuplicateImportRowFingerprint(row);

    const review = buildDuplicateImportReview(
      [row],
      duplicateResult({
        duplicateRowFingerprints: [fingerprint],
        matchedInvoices: ['INV-105'],
      }),
    );

    expect(review.items).toHaveLength(1);
    expect(review.items[0]?.label).toContain('INV-105');
    expect(review.items[0]?.label).toContain('Ravi');
    expect(review.items[0]?.warningMessage).toBe('Same invoice found');
    expect(review.items[0]?.rowNumber).toBe(2);
  });

  it('uses similar-sale wording when invoice does not match', () => {
    const row = importableRow(3, {
      saleDate: '2026-08-21',
      customerName: 'Kumar',
      productName: 'Cake',
      quantity: 1,
    });
    const fingerprint = buildDuplicateImportRowFingerprint(row);

    const review = buildDuplicateImportReview(
      [row],
      duplicateResult({
        duplicateRowFingerprints: [fingerprint],
        matchedInvoices: [],
      }),
    );

    expect(review.items[0]?.warningMessage).toBe('Similar sale already exists');
  });

  it('counts non-flagged importable rows separately', () => {
    const flagged = importableRow(2, {
      saleDate: '2026-08-21',
      customerName: 'Ravi',
      productName: 'Bread',
      quantity: 10,
    });
    const fresh = importableRow(3, {
      saleDate: '2026-08-22',
      customerName: 'Anita',
      productName: 'Puff',
      quantity: 5,
    });
    const fingerprint = buildDuplicateImportRowFingerprint(flagged);

    const review = buildDuplicateImportReview(
      [flagged, fresh],
      duplicateResult({ duplicateRowFingerprints: [fingerprint] }),
    );

    expect(review.flaggedCount).toBe(1);
    expect(review.nonFlaggedImportableCount).toBe(1);
  });
});

describe('duplicate review selection helpers', () => {
  const row = importableRow(2, {
    saleDate: '2026-08-21',
    customerName: 'Ravi',
    productName: 'Bread',
    quantity: 10,
    saleNumber: 'INV-105',
  });
  const review = buildDuplicateImportReview(
    [row],
    duplicateResult({
      duplicateRowFingerprints: [buildDuplicateImportRowFingerprint(row)],
      matchedInvoices: ['INV-105'],
    }),
  );

  it('defaults all flagged rows to selected', () => {
    expect(defaultSelectedDuplicateRowNumbers(review.items)).toEqual([2]);
  });

  it('derives skipped row numbers from unchecked selections', () => {
    const skipped = duplicateReviewSkippedRowNumbers(review.items, new Set());

    expect(skipped).toEqual([2]);
  });

  it('counts selected imports', () => {
    expect(countSelectedDuplicateImports(review, new Set([2]))).toBe(1);
    expect(countSelectedDuplicateImports(review, new Set())).toBe(0);
  });
});

describe('duplicateResultNeedsUserConfirmation', () => {
  it('requires confirmation for BLOCK, REVIEW, and SKIP_DUPLICATES', () => {
    expect(
      duplicateResultNeedsUserConfirmation(
        duplicateResult({ recommendation: DUPLICATE_IMPORT_RECOMMENDATION.BLOCK_IMPORT }),
      ),
    ).toBe(true);
    expect(
      duplicateResultNeedsUserConfirmation(
        duplicateResult({ recommendation: DUPLICATE_IMPORT_RECOMMENDATION.REVIEW }),
      ),
    ).toBe(true);
    expect(
      duplicateResultNeedsUserConfirmation(
        duplicateResult({ recommendation: DUPLICATE_IMPORT_RECOMMENDATION.SKIP_DUPLICATES }),
      ),
    ).toBe(true);
    expect(
      duplicateResultNeedsUserConfirmation(
        duplicateResult({ recommendation: DUPLICATE_IMPORT_RECOMMENDATION.CONTINUE }),
      ),
    ).toBe(false);
  });
});

describe('buildDuplicateImportWarning', () => {
  it('uses exact-file copy for identical file imports', () => {
    const warning = buildDuplicateImportWarning(
      duplicateResult({
        status: DUPLICATE_IMPORT_STATUS.EXACT_DUPLICATE,
        recommendation: DUPLICATE_IMPORT_RECOMMENDATION.BLOCK_IMPORT,
      }),
    );

    expect(warning.kind).toBe('exact-file');
    expect(warning.title).toBe('This file was imported before');
    expect(warning.message).not.toContain('fingerprint');
  });

  it('uses invoice copy when invoice numbers match', () => {
    const warning = buildDuplicateImportWarning(
      duplicateResult({
        recommendation: DUPLICATE_IMPORT_RECOMMENDATION.BLOCK_IMPORT,
        matchedInvoices: ['INV-105'],
      }),
    );

    expect(warning.kind).toBe('invoice-match');
    expect(warning.message).toContain('INV-105');
  });
});

describe('duplicateResultNeedsRowReview', () => {
  it('requires review for REVIEW and SKIP_DUPLICATES recommendations', () => {
    expect(
      duplicateResultNeedsRowReview(
        duplicateResult({ recommendation: DUPLICATE_IMPORT_RECOMMENDATION.REVIEW }),
      ),
    ).toBe(true);
    expect(
      duplicateResultNeedsRowReview(
        duplicateResult({ recommendation: DUPLICATE_IMPORT_RECOMMENDATION.SKIP_DUPLICATES }),
      ),
    ).toBe(true);
    expect(
      duplicateResultNeedsRowReview(
        duplicateResult({ recommendation: DUPLICATE_IMPORT_RECOMMENDATION.CONTINUE }),
      ),
    ).toBe(false);
  });
});

describe('formatSaleRowReviewLabel', () => {
  it('formats unnumbered sales without technical identifiers', () => {
    const label = formatSaleRowReviewLabel(
      importableRow(2, {
        saleDate: '2026-08-21',
        customerName: 'Ravi',
        productName: 'Bread',
        quantity: 10,
      }),
    );

    expect(label).toContain('Ravi');
    expect(label).toContain('Bread');
    expect(label).not.toContain('importId');
  });
});
