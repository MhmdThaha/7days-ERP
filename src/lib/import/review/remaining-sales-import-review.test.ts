/**
 * Remaining sales import review helpers.
 */

import { describe, expect, it } from 'vitest';

import {
  buildRemainingSalesImportReview,
  collectImportedRowNumbers,
  mergeResolutionsWithImportedSkips,
} from '@/lib/import/review/remaining-sales-import-review';
import type { ImportReviewViewModelWithResolution } from '@/lib/import/resolution/types';
import { SALES_DETAIL_REPORT } from '@/lib/import/reports/definitions';
import {
  AUTO_IMPORT_RECOMMENDATION,
  CONFIDENCE_LEVEL,
} from '@/lib/import/services/confidence-engine.service';
import { CONFLICT_ENGINE_STATUS } from '@/lib/import/services/conflict-engine.service';
import { PRODUCT_MATCH_STATUS } from '@/lib/import/services/product-matching.service';

function readyRow(rowNumber: number): ImportReviewViewModelWithResolution['rows'][number] {
  return {
    rowNumber,
    originalValues: { productName: `Product ${rowNumber}` },
    normalizedValues: {
      customerName: 'Cafe',
      productName: `Product ${rowNumber}`,
      quantity: 1,
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
      matchedProductId: `prod-${rowNumber}`,
      matchedProductName: `Product ${rowNumber}`,
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
  };
}

function fuzzyRow(rowNumber: number): ImportReviewViewModelWithResolution['rows'][number] {
  return {
    ...readyRow(rowNumber),
    productMatchResult: {
      status: PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION,
      matchedProductId: 'prod-bread',
      matchedProductName: 'Bread',
      confidence: 70,
      reason: 'Fuzzy Name Match',
    },
    confidenceResult: {
      confidenceScore: 60,
      confidenceLevel: CONFIDENCE_LEVEL.MEDIUM,
      confidenceReasons: ['Fuzzy product name match'],
      autoImportRecommendation: AUTO_IMPORT_RECOMMENDATION.USER_CONFIRMATION,
    },
  };
}

describe('remaining sales import review', () => {
  it('keeps only unresolved rows after partial import', () => {
    const review: ImportReviewViewModelWithResolution = {
      overview: {
        fileName: 'sales.csv',
        detectedReportName: 'Sales Detail',
        detectedReportType: 'sales-detail',
        reportConfidence: 0.9,
        headerRowIndex: 0,
        totalRows: 3,
        readyRows: 1,
        warningRows: 0,
        errorRows: 2,
        averageConfidence: 70,
        autoImportEligibleRows: 0,
        blockedRows: 2,
      },
      reportSummary: {
        matchedColumns: [],
        missingRequiredColumns: [],
        extraColumns: [],
        unknownHeaders: [],
        detectionReasons: [],
      },
      rows: [readyRow(1), fuzzyRow(2), fuzzyRow(3)],
    };

    const remaining = buildRemainingSalesImportReview(review, [1]);

    expect(remaining.rows.map((row) => row.rowNumber)).toEqual([2, 3]);
    expect(remaining.overview.totalRows).toBe(2);
  });

  it('merges skip resolutions for already imported rows', () => {
    const merged = mergeResolutionsWithImportedSkips(
      [{ rowNumber: 2, action: 'select-existing', selectedProductId: 'prod-2' }],
      [1, 5],
    );

    expect(merged).toEqual(
      expect.arrayContaining([
        { rowNumber: 2, action: 'select-existing', selectedProductId: 'prod-2' },
        { rowNumber: 1, action: 'skip-row' },
        { rowNumber: 5, action: 'skip-row' },
      ]),
    );
  });

  it('collects imported row numbers from execution results', () => {
    expect(
      collectImportedRowNumbers([
        { rowNumber: 1, status: 'imported', saleId: 's1' },
        { rowNumber: 2, status: 'skipped', reason: 'needs product' },
        { rowNumber: 3, status: 'imported', saleId: 's3' },
      ]),
    ).toEqual([1, 3]);
  });
});
