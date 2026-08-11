/**
 * Owner-facing import review bucket tests.
 */

import { describe, expect, it } from 'vitest';

import {
  computeImportReviewSummary,
  getImportReviewRowBucket,
  getOwnerFacingRowStatus,
  partitionImportReviewRows,
} from '@/lib/import/review/import-review-buckets';
import type { ImportReviewRowViewModel } from '@/lib/import/review/types';
import { SALES_DETAIL_REPORT } from '@/lib/import/reports/definitions';
import {
  AUTO_IMPORT_RECOMMENDATION,
  CONFIDENCE_LEVEL,
} from '@/lib/import/services/confidence-engine.service';
import {
  CONFLICT_ENGINE_STATUS,
  IMPORT_CONFLICT_CODE,
} from '@/lib/import/services/conflict-engine.service';
import { PRODUCT_MATCH_STATUS } from '@/lib/import/services/product-matching.service';

function baseRow(overrides: Partial<ImportReviewRowViewModel> = {}): ImportReviewRowViewModel {
  return {
    rowNumber: 2,
    originalValues: { productName: 'Large Milk Bread' },
    normalizedValues: {
      customerName: 'Ashraf Filipino Cafe',
      productName: 'Large Milk Bread',
      productCode: null,
      quantity: 116,
      amount: 4060,
      saleDate: '2026-08-05',
    },
    reportDetectionResult: {
      profile: SALES_DETAIL_REPORT,
      reportType: 'sales-detail',
      confidence: 0.9,
      matchedColumns: [],
      missingColumns: [],
      matchedHeaders: [],
      missingHeaders: [],
      unmatchedHeaders: [],
      explanation: [],
      candidates: [],
    },
    productMatchResult: {
      status: PRODUCT_MATCH_STATUS.MATCHED,
      matchedProductId: 'prod-large',
      matchedProductName: 'Large Milk Bread',
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
      confidenceScore: 85,
      confidenceLevel: CONFIDENCE_LEVEL.HIGH,
      confidenceReasons: [],
      autoImportRecommendation: AUTO_IMPORT_RECOMMENDATION.PREVIEW_FIRST,
    },
    ...overrides,
  };
}

function buildScenarioRows() {
  const ready = Array.from({ length: 10 }, (_, index) =>
    baseRow({ rowNumber: index + 1 }),
  );

  const fuzzy = Array.from({ length: 4 }, (_, index) =>
    baseRow({
      rowNumber: 11 + index,
      productMatchResult: {
        status: PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION,
        matchedProductId: 'prod-bread',
        matchedProductName: 'Bread',
        confidence: 70,
        reason: 'Fuzzy Name Match',
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
        confidenceScore: 60,
        confidenceLevel: CONFIDENCE_LEVEL.MEDIUM,
        confidenceReasons: ['Fuzzy product name match'],
        autoImportRecommendation: AUTO_IMPORT_RECOMMENDATION.USER_CONFIRMATION,
      },
    }),
  );

  const notFound = Array.from({ length: 2 }, (_, index) =>
    baseRow({
      rowNumber: 15 + index,
      normalizedValues: {
        customerName: 'Corner Store',
        productName: 'Chocolate Cake',
        productCode: null,
        quantity: 1,
        saleDate: '2026-08-05',
      },
      productMatchResult: {
        status: PRODUCT_MATCH_STATUS.NOT_FOUND,
        matchedProductId: null,
        matchedProductName: null,
        confidence: 0,
        reason: 'No matching product',
      },
      conflictEngineResult: {
        status: CONFLICT_ENGINE_STATUS.ERROR,
        conflicts: [
          {
            code: IMPORT_CONFLICT_CODE.UNKNOWN_PRODUCT,
            message: 'Product was not found in BakeryOS.',
            field: 'productName',
          },
        ],
        warnings: [],
        blockingReason: 'Product was not found in BakeryOS.',
        recommendedAction: 'Map this row to an existing product.',
        confidencePenalty: 40,
      },
      confidenceResult: {
        confidenceScore: 20,
        confidenceLevel: CONFIDENCE_LEVEL.VERY_LOW,
        confidenceReasons: ['Unknown product'],
        autoImportRecommendation: AUTO_IMPORT_RECOMMENDATION.BLOCK_IMPORT,
      },
    }),
  );

  return [...ready, ...fuzzy, ...notFound];
}

describe('computeImportReviewSummary', () => {
  it('counts 16 rows as 10 ready, 4 attention, and 2 errors for not-found products', () => {
    const summary = computeImportReviewSummary(buildScenarioRows());

    expect(summary.total).toBe(16);
    expect(summary.ready).toBe(10);
    expect(summary.needsAttention).toBe(4);
    expect(summary.errors).toBe(2);
    expect(summary.importableCount).toBe(10);
  });
});

describe('getImportReviewRowBucket', () => {
  it('classifies fuzzy rows as needs-attention, not ready', () => {
    const fuzzy = baseRow({
      productMatchResult: {
        status: PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION,
        matchedProductId: 'prod-bread',
        matchedProductName: 'Bread',
        confidence: 70,
        reason: 'Fuzzy Name Match',
      },
    });

    expect(getImportReviewRowBucket(fuzzy)).toBe('needs-attention');
    expect(getOwnerFacingRowStatus(fuzzy).label).toBe('Needs your attention');
  });

  it('moves a fuzzy row to ready after product resolution', () => {
    const resolved = baseRow({
      productMatchResult: {
        status: PRODUCT_MATCH_STATUS.MATCHED,
        matchedProductId: 'prod-bread',
        matchedProductName: 'Bread',
        confidence: 100,
        reason: 'Manual Resolution',
      },
      productResolution: {
        action: 'select-existing',
        selectedProductId: 'prod-bread',
        resolvedInMemory: true,
      },
    });

    expect(getImportReviewRowBucket(resolved)).toBe('ready');
  });
});

describe('partitionImportReviewRows', () => {
  it('separates ready and attention rows for section rendering', () => {
    const rows = buildScenarioRows();
    const partitioned = partitionImportReviewRows(rows);

    expect(partitioned.ready).toHaveLength(10);
    expect(partitioned.needsAttention).toHaveLength(4);
    expect(partitioned.errors).toHaveLength(2);
  });
});
