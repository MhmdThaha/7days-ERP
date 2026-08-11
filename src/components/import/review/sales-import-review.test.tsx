// @vitest-environment jsdom
/**
 * Simplified sales import review UI tests.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SalesImportReview } from '@/components/import/review/sales-import-review';
import type { ImportReviewRowViewModel, ImportReviewViewModel } from '@/lib/import/review/types';
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
import {
  isReadOnlyProductResolution,
  needsProductResolution,
} from '@/lib/import/resolution';

afterEach(cleanup);

function row(partial: Partial<ImportReviewRowViewModel>): ImportReviewRowViewModel {
  return {
    rowNumber: 2,
    originalValues: { productName: 'Large Milk Bread' },
    normalizedValues: {
      customerName: 'Ashraf Filipino Cafe',
      productName: 'Large Milk Bread',
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
    ...partial,
  };
}

function viewModel(rows: ImportReviewRowViewModel[]): ImportReviewViewModel {
  return {
    overview: {
      fileName: 'sales.csv',
      detectedReportName: 'Sales Detail',
      detectedReportType: 'sales-detail',
      reportConfidence: 0.9,
      headerRowIndex: 0,
      totalRows: rows.length,
      readyRows: rows.length,
      warningRows: 0,
      errorRows: 0,
      averageConfidence: 80,
      autoImportEligibleRows: 0,
      blockedRows: 0,
    },
    reportSummary: {
      matchedColumns: [],
      missingRequiredColumns: [],
      extraColumns: [],
      unknownHeaders: [],
      detectionReasons: [],
    },
    rows,
  };
}

describe('SalesImportReview', () => {
  it('shows owner-facing summary counts and sections', () => {
    const readyRows = Array.from({ length: 10 }, (_, index) =>
      row({ rowNumber: index + 1 }),
    );
    const fuzzyRows = Array.from({ length: 4 }, (_, index) =>
      row({
        rowNumber: 11 + index,
        productMatchResult: {
          status: PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION,
          matchedProductId: 'prod-bread',
          matchedProductName: 'Bread',
          confidence: 70,
          reason: 'Fuzzy Name Match',
        },
      }),
    );
    const missingRows = Array.from({ length: 2 }, (_, index) =>
      row({
        rowNumber: 15 + index,
        normalizedValues: {
          customerName: 'Store',
          productName: 'Chocolate Cake',
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
          recommendedAction: null,
          confidencePenalty: 40,
        },
      }),
    );

    render(
      <SalesImportReview
        viewModel={viewModel([...readyRows, ...fuzzyRows, ...missingRows])}
        onResolve={() => undefined}
        needsResolution={needsProductResolution}
        isReadOnly={isReadOnlyProductResolution}
      />,
    );

    expect(screen.getByText('16 sales found')).toBeDefined();
    expect(screen.getByText(/10 Ready to import/)).toBeDefined();
    expect(screen.getByText(/4 Need your attention/)).toBeDefined();
    expect(screen.getByText(/2 Cannot import yet/)).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Ready to import' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Needs your attention' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Cannot import yet' })).toBeDefined();
    expect(screen.getAllByText('BakeryOS suggests: Bread').length).toBe(4);
    expect(screen.getAllByText('Product not found in BakeryOS.').length).toBe(2);
    expect(screen.queryByText('Fuzzy Name Match')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Choose product' }).length).toBeGreaterThan(0);
  });

  it('keeps technical details behind View details', () => {
    render(
      <SalesImportReview
        viewModel={viewModel([
          row({
            productMatchResult: {
              status: PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION,
              matchedProductId: 'prod-bread',
              matchedProductName: 'Bread',
              confidence: 70,
              reason: 'Fuzzy Name Match',
            },
          }),
        ])}
        onResolve={() => undefined}
        needsResolution={needsProductResolution}
        isReadOnly={isReadOnlyProductResolution}
      />,
    );

    expect(screen.queryByText('Fuzzy Name Match')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'View details' }));
    expect(screen.getByText('Fuzzy Name Match')).toBeDefined();
  });
});
