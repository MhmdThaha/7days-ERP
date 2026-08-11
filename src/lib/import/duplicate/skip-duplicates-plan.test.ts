/**
 * Skip-duplicates plan helpers — counts used by duplicate confirmation UX.
 */

import { describe, expect, it } from 'vitest';

import {
  DUPLICATE_IMPORT_RECOMMENDATION,
  DUPLICATE_IMPORT_STATUS,
  buildDuplicateImportRowFingerprint,
  planSkipDuplicates,
} from '@/lib/import/duplicate';
import type { ResolvedImportReviewRow } from '@/lib/import/resolution/types';
import { SALES_DETAIL_REPORT } from '@/lib/import/reports/definitions';
import {
  AUTO_IMPORT_RECOMMENDATION,
  CONFIDENCE_LEVEL,
} from '@/lib/import/services/confidence-engine.service';
import { CONFLICT_ENGINE_STATUS } from '@/lib/import/services/conflict-engine.service';
import { PRODUCT_MATCH_STATUS } from '@/lib/import/services/product-matching.service';

function importableRow(
  rowNumber: number,
  overrides: Partial<ResolvedImportReviewRow> = {},
): ResolvedImportReviewRow {
  return {
    rowNumber,
    originalValues: {},
    normalizedValues: {
      saleDate: '2026-03-15',
      customerName: `Store ${rowNumber}`,
      productName: 'Milk Bread',
      productCode: 'BRD-001',
      quantity: 2,
      saleNumber: `SAL-${rowNumber}`,
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
      matchedProductId: 'prod-bread',
      matchedProductName: 'Milk Bread',
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
    ...overrides,
  };
}

describe('planSkipDuplicates', () => {
  it('counts duplicate vs new importable rows for SKIP_DUPLICATES', () => {
    const duplicate = importableRow(2);
    const fresh = importableRow(3);

    const plan = planSkipDuplicates([duplicate, fresh], {
      status: DUPLICATE_IMPORT_STATUS.HIGH_CONFIDENCE_DUPLICATE,
      confidence: 90,
      matchedImport: null,
      matchedInvoices: [],
      matchedRows: 1,
      duplicateRowFingerprints: [buildDuplicateImportRowFingerprint(duplicate)],
      duplicateReasons: [],
      recommendation: DUPLICATE_IMPORT_RECOMMENDATION.SKIP_DUPLICATES,
    });

    expect(plan).toEqual({ duplicateSalesCount: 1, newSalesCount: 1 });
  });

  it('returns zeros when recommendation is not SKIP_DUPLICATES', () => {
    expect(
      planSkipDuplicates([importableRow(2)], {
        status: DUPLICATE_IMPORT_STATUS.NO_DUPLICATE,
        confidence: 0,
        matchedImport: null,
        matchedInvoices: [],
        matchedRows: 0,
        duplicateRowFingerprints: [],
        duplicateReasons: [],
        recommendation: DUPLICATE_IMPORT_RECOMMENDATION.CONTINUE,
      }),
    ).toEqual({ duplicateSalesCount: 0, newSalesCount: 0 });
  });
});
